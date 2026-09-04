/**
 * CloudFault scenario: an upload whose R2 write commits but loses its
 * response.
 *
 * This is the failure the upload route cannot see from the inside. R2 accepts
 * the object, the acknowledgement never reaches the Worker, and the Worker
 * answers 500 for a file that is already stored. What happens next is the
 * client's retry, and the retry is where the money is:
 *
 *   - retry under a *fresh* key and the first object stays behind — nothing
 *     references it, nobody can list it, and it is billed every month. That
 *     is the orphan, and it is silent: every test passes, the user sees their
 *     file, and the bucket grows;
 *   - retry under the *same* key and the second write overwrites the first,
 *     so the whole episode costs one object.
 *
 * `uploadKey` in src/server/storage.ts chooses the second by honouring an
 * `Idempotency-Key` header, and `r2-upload-retry-leaves-no-orphan` below is
 * what holds it to that. A unit test cannot reach this: it needs a write that
 * succeeds and reports failure, which is a property of the *binding*, not of
 * anything the handler can be asked to do.
 *
 * `r2CapacityError` is the honest contrast — a definite failure, before the
 * commit, where a retry is unambiguously the right move. Both faults are in
 * `@gmacko/cloudfault@^0.1.0`; the multipart ones are not (see
 * helpers/cloudfault.ts), so `putLarge` has no scenario yet.
 */
import { env } from "cloudflare:workers";
import type { StoredObject, UploadIdentity } from "@gmacko/storage";
import { expect, it } from "vitest";

// Relative, not `~/`: fault/ sits outside the app tsconfig's include
// (see docs/FAULT_TESTING.md), so the `~/*` path mapping does not reach here.
import { createStorageHandlers, STORAGE_PREFIX } from "../src/server/storage";
import type {
  FaultPoint,
  R2BucketLike,
  RunResult,
  Scenario,
} from "./helpers/cloudfault";
import {
  createR2FaultProxy,
  invariant,
  r2CapacityError,
  r2CommitThenTimeout,
  runCheckers,
  ScenarioController,
} from "./helpers/cloudfault";
import {
  assertActivated,
  explore,
  minimalFailureSetIds,
} from "./helpers/explore";

/** The binding name in wrangler.jsonc, and so the fault selector's target. */
const TARGET = "BUCKET";

const USER: UploadIdentity = { id: "user-cloudfault" };
/** One logical upload, which every attempt in a run is a retry of. */
const IDEMPOTENCY_KEY = "cloudfault-avatar-1";
const CONTENT_TYPE = "image/png";
const FILE = new Uint8Array(new ArrayBuffer(2048)).fill(0x89);

/**
 * How many times the client tries before giving up. Two faults can be active
 * at once at depth 2 — one before the commit, one after — and each activates
 * at most once, so three attempts is the smallest bound that still lets a
 * correct client finish.
 */
const MAX_ATTEMPTS = 3;

interface UploadState {
  /** The status of every attempt, in order; 500 for an unhandled throw. */
  readonly acknowledged: ReadonlyArray<number>;
  /** The keys the route acknowledged, in order. */
  readonly acknowledgedKeys: ReadonlyArray<string>;
  /** What the bucket actually holds, read through the *unproxied* binding. */
  readonly stored: ReadonlyArray<{
    readonly key: string;
    readonly size: number;
  }>;
}

/** What is really in the bucket, bypassing the fault proxy entirely. */
const storedObjects = async (): Promise<UploadState["stored"]> => {
  const listed = await env.BUCKET.list({ limit: 1000 });
  return listed.objects.map((object) => ({
    key: object.key,
    size: object.size,
  }));
};

/** Empties the bucket, so every run in the search starts from the same state. */
const resetBucket = async (): Promise<void> => {
  const listed = await env.BUCKET.list({ limit: 1000 });
  if (listed.objects.length > 0) {
    await env.BUCKET.delete(listed.objects.map((object) => object.key));
  }
};

/** One delivery attempt: the same bytes, the same idempotency key, a fresh body. */
const uploadRequest = (): Request =>
  new Request("https://example.com/api/storage", {
    method: "POST",
    headers: {
      "content-type": CONTENT_TYPE,
      "idempotency-key": IDEMPOTENCY_KEY,
    },
    body: FILE,
  });

const execute = async (scenario: Scenario): Promise<RunResult<UploadState>> => {
  const started = Date.now();
  const controller = new ScenarioController(scenario);
  await resetBucket();

  // SAFETY: as in helpers/ledger.ts — `R2BucketLike` names the same methods as
  // the generated `R2Bucket` with looser result types, and the proxy is a
  // `Proxy` that forwards everything but the terminal bucket methods, so what
  // comes back is the same binding object with the same runtime surface.
  const wrapped = createR2FaultProxy(env.BUCKET as R2BucketLike, {
    controller,
    target: TARGET,
    process: "worker",
    callsite: "storage-upload",
  });
  // The app's own composition — its limits, its prefix, and above all its key
  // policy — over a perturbed bucket. Nothing here is a stand-in for the route
  // except the identity, and identity is not what is under fault.
  //
  // `enabled: true` because the template ships storage off and the handlers
  // read that at construction; every fault below would then be selected
  // against an operation that never happens, and `assertActivated` would say
  // so. The flag is a parameter for exactly this reason.
  //
  // SAFETY: the proxy is the binding with the terminal bucket methods
  // interposed, so it has the same runtime surface `R2Bucket` names; the two
  // declarations know nothing of each other, which is why no single assertion
  // connects them.
  // oxlint-disable-next-line anti-slop/no-chained-type-assertions
  const perturbed = wrapped as unknown as R2Bucket;
  const { upload } = createStorageHandlers(
    perturbed,
    () => Promise.resolve(USER),
    { enabled: true },
  );

  const acknowledged: number[] = [];
  const acknowledgedKeys: string[] = [];

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    const operation = controller.begin({
      id: `app:upload:${IDEMPOTENCY_KEY}:${attempt}`,
      name: "handleUpload",
      process: "worker",
      target: "app",
      resource: `upload:${IDEMPOTENCY_KEY}`,
      attempt,
    });
    try {
      const response = await upload(uploadRequest());
      acknowledged.push(response.status);
      if (response.ok) {
        const stored: StoredObject = await response.json();
        acknowledgedKeys.push(stored.key);
      }
      controller.complete(
        operation,
        response.ok ? "ok" : "fail",
        { status: response.status },
        {
          actual: "committed",
          observed: response.ok ? "success" : "definite-failure",
        },
      );
      // A client stops retrying the moment it is told the upload landed.
      if (response.ok) break;
    } catch (error) {
      // An unhandled throw is the 500 the route would send. Whether the write
      // behind it committed is CloudFault's business, not the caller's: the
      // R2 proxy already recorded `actual` in the history.
      acknowledged.push(500);
      controller.complete(
        operation,
        "fail",
        { error: String(error) },
        { actual: "unknown", observed: "definite-failure" },
      );
    }
  }

  const state: UploadState = {
    acknowledged,
    acknowledgedKeys,
    stored: await storedObjects(),
  };
  const history = controller.history.snapshot();

  const checks = await runCheckers(
    [
      invariant<UploadState>(
        "r2-upload-ack-implies-object",
        ({ state: seen }) =>
          seen.acknowledgedKeys.every((key) =>
            seen.stored.some(
              (object) =>
                object.key === `${STORAGE_PREFIX}/${key}` &&
                object.size === FILE.length,
            ),
          ),
        ({ state: seen }) =>
          `The route acknowledged ${seen.acknowledgedKeys.join(", ")} but the bucket holds ${seen.stored.map((object) => object.key).join(", ") || "nothing"}. A 200 is a promise that the bytes are retrievable from that key.`,
      ),
      invariant<UploadState>(
        "r2-upload-retry-leaves-no-orphan",
        ({ state: seen }) => seen.stored.length <= 1,
        ({ state: seen }) =>
          `One logical upload left ${seen.stored.length} objects behind (${seen.stored.map((object) => object.key).join(", ")}). A write that commits and loses its response makes the client retry; unless the retry writes the SAME key, the first object is orphaned — referenced by nothing, listed by nothing, and billed every month.`,
      ),
      invariant<UploadState>(
        "r2-upload-lands-within-the-retry-budget",
        ({ state: seen }) =>
          seen.acknowledged.includes(200) && seen.stored.length === 1,
        ({ state: seen }) =>
          `After ${seen.acknowledged.length} attempts the client saw ${seen.acknowledged.join(", ")} and the bucket holds ${seen.stored.length} object(s). Each of these faults activates once, so a client that retries must get its file stored.`,
      ),
    ],
    { history, state },
  );

  return {
    scenario,
    history,
    checks,
    state,
    durationMs: Date.now() - started,
  };
};

const faultPoints: ReadonlyArray<FaultPoint> = [
  {
    id: "r2-upload-write",
    target: TARGET,
    choices: [
      // The case unit tests structurally cannot reach: the object lands and
      // the Worker is told it did not.
      r2CommitThenTimeout(TARGET, "r2.put"),
      // The honest contrast: nothing committed, and the caller can trust that.
      r2CapacityError(TARGET),
    ],
  },
];

it("stores one object for one upload, however the R2 write fails", async () => {
  const result = await explore({
    name: "r2-upload/commit-then-timeout",
    faultPoints,
    execute,
  });
  // Unperturbed: one attempt, one 200, one object.
  expect(result.baseline?.state?.acknowledged).toEqual([200]);
  expect(result.baseline?.state?.stored).toHaveLength(1);
  expect(minimalFailureSetIds(result)).toEqual([]);
  // A green fault lane is worthless if the faults never fired.
  assertActivated(result, faultPoints);
});
