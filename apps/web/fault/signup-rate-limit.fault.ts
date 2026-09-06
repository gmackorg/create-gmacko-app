/**
 * CloudFault scenario: the sign-up rate limiter under a D1 outage.
 *
 * `RateLimiter.layerD1` is the global counter behind sign-up and magic-link
 * send — the two scopes where a per-colo Rate Limiting binding is not good
 * enough. Its contract has two halves, and they pull in opposite directions:
 *
 *   1. `signup-rate-limit-refuses-past-the-allowance` — once the window's
 *      allowance is spent, the next call is `RateLimited`. That is the whole
 *      point of the limiter.
 *   2. `signup-rate-limit-fails-open` — when the *counter itself* fails, the
 *      call goes through. A limiter that cannot count must not lock every
 *      caller out: an outage of `rate_limit_window` would otherwise take
 *      sign-up down with it. `packages/api/src/rate-limit.ts` states this and
 *      implements it with `Effect.catchTag("DatabaseError", allowAfter)`.
 *
 * The second is what the fault lane adds. A unit test can only reach it by
 * substituting a database layer that always fails, which proves the catch
 * exists but not that it covers the statement the limiter actually issues.
 * Here the fault is injected into the real guarded upsert on a real D1.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { defaultRateLimits, RateLimiter } from "@gmacko/api";
import { Database } from "@gmacko/db";
import { RateLimited } from "@gmacko/domain";
import { Cause, Effect, Exit, Layer, ManagedRuntime, Option } from "effect";
import { beforeAll, expect, it } from "vitest";

import type {
  D1DatabaseLike,
  FaultPoint,
  RunResult,
  Scenario,
} from "./helpers/cloudfault";
import {
  createD1FaultProxy,
  invariant,
  runCheckers,
  ScenarioController,
} from "./helpers/cloudfault";
import {
  assertActivated,
  explore,
  minimalFailureSetIds,
} from "./helpers/explore";
import { d1WriteFaults } from "./helpers/perturbations";

const counterFaults = d1WriteFaults("signup-rate-limit-counter");

/** Small enough that three calls exhaust it inside one run. */
const limits = {
  ...defaultRateLimits,
  signup: { limit: 2, windowMs: 60_000 },
};

/**
 * What the caller saw. `"error"` is the interesting one: the limiter's own
 * failure reaching the caller instead of being swallowed, which is the
 * failure mode the fail-open branch exists to prevent.
 */
type CallOutcome = "allowed" | "rate-limited" | "error";

interface RateLimitState {
  readonly outcomes: ReadonlyArray<CallOutcome>;
  /** True once a D1 fault activated during the run. */
  readonly perturbed: boolean;
}

const execute = async (
  scenario: Scenario,
): Promise<RunResult<RateLimitState>> => {
  const started = Date.now();
  const controller = new ScenarioController(scenario);
  await env.DB.prepare("delete from rate_limit_window").run();

  // SAFETY: as in helpers/ledger.ts — `D1DatabaseLike` names the same methods
  // as `D1Database` with looser result types, so the binding satisfies it.
  const binding = env.DB as D1DatabaseLike;
  const wrapped = createD1FaultProxy(binding, {
    controller,
    target: "DB",
    process: "worker",
    callsite: "rate-limit",
  });
  // SAFETY: the proxy forwards everything but the terminal statement methods,
  // so it is the same binding object with the same runtime surface.
  const proxied = wrapped as D1Database;
  const runtime = ManagedRuntime.make(
    RateLimiter.layerD1(limits).pipe(Layer.provide(Database.layer(proxied))),
  );

  const outcomes: Array<CallOutcome> = [];
  for (let call = 1; call <= 3; call += 1) {
    const operation = controller.begin({
      id: `app:signup:${call}`,
      name: "consume",
      process: "worker",
      target: "app",
      resource: "signup:1.2.3.4",
      attempt: call,
    });
    const exit = await runtime.runPromiseExit(
      Effect.flatMap(RateLimiter, (limiter) =>
        limiter.consume("signup", "1.2.3.4"),
      ),
    );
    // `RateLimited` is the limiter doing its job. Anything else out of
    // `consume` — a defect from an unswallowed `DatabaseError`, say — is the
    // limiter failing at the caller's expense.
    const outcome: CallOutcome = Exit.isSuccess(exit)
      ? "allowed"
      : Option.getOrUndefined(Cause.findErrorOption(exit.cause)) instanceof
          RateLimited
        ? "rate-limited"
        : "error";
    outcomes.push(outcome);
    controller.complete(
      operation,
      outcome === "allowed" ? "ok" : "fail",
      { outcome },
      {
        actual: "unknown",
        observed: outcome === "allowed" ? "success" : "definite-failure",
      },
    );
  }
  await runtime.dispose();

  const history = controller.history.snapshot();
  const state: RateLimitState = {
    outcomes,
    perturbed: history.some((event) => event.type === "fault"),
  };

  const checks = await runCheckers(
    [
      invariant<RateLimitState>(
        "signup-rate-limit-refuses-past-the-allowance",
        ({ state: seen }) =>
          seen.perturbed ||
          seen.outcomes.join() === "allowed,allowed,rate-limited",
        ({ state: seen }) =>
          `With no fault injected the allowance is ${limits.signup.limit}, so the calls should read allowed,allowed,rate-limited; they read ${seen.outcomes.join()}.`,
      ),
      invariant<RateLimitState>(
        "signup-rate-limit-fails-open",
        ({ state: seen }) => !seen.outcomes.includes("error"),
        ({ state: seen }) =>
          `A D1 fault on the counter reached the caller (${seen.outcomes.join()}). A limiter that cannot count must fail open — the call goes through — or an outage of rate_limit_window takes sign-up down with it.`,
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
    id: "rate-limit-counter",
    target: "DB",
    choices: [counterFaults.transientError, counterFaults.commitThenTimeout],
  },
];

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

it("lets sign-up through when its D1 counter fails, and refuses past the allowance otherwise", async () => {
  const result = await explore({
    name: "signup-rate-limit/counter-outage",
    faultPoints,
    execute,
  });
  expect(result.baseline?.state?.outcomes).toEqual([
    "allowed",
    "allowed",
    "rate-limited",
  ]);
  expect(minimalFailureSetIds(result)).toEqual([]);
  assertActivated(result, faultPoints);
});
