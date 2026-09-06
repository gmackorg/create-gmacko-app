/**
 * The guarded writes on a real D1 (Miniflare, `@cloudflare/vitest-pool-workers`):
 * two concurrent `completeBootstrap` / `reviewWaitlistEntry` calls yield
 * exactly one success and one Conflict, and the losing batch leaves no
 * rows behind. The services are driven directly over `Database.layer(env.DB)`
 * (better-auth and the HTTP stack are covered by the Node suite); the
 * batches and their guards are what D1 has to prove.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { Database } from "@gmacko/db";
import {
  applicationSettings,
  user,
  waitlistEntry,
  workspace,
  workspaceInviteAllowlist,
} from "@gmacko/db/schema";
import {
  CompleteBootstrap,
  ReviewWaitlistEntry,
  WaitlistEntryId,
} from "@gmacko/domain";
import { Conflict } from "@gmacko/domain/errors";
import { eq } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime, Result } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Bootstrap, WaitlistReview } from "./service";

const DatabaseLive = Database.layer(env.DB);
const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    DatabaseLive,
    Bootstrap.layer.pipe(Layer.provide(DatabaseLive)),
    WaitlistReview.layer.pipe(Layer.provide(DatabaseLive)),
  ),
);

const seedUser = (id: string) =>
  runtime.runPromise(
    Effect.flatMap(Database, ({ db }) =>
      db.insert(user).values({
        id,
        name: id,
        email: `${id}@example.com`,
        emailVerified: true,
        role: "user",
        createdAt: new Date(),
        updatedAt: new Date(),
      }),
    ),
  );

/** "success", or the `Conflict.reason` the guarded write refused with. */
const outcome = <A, E>(result: Result.Result<A, E>): string =>
  Result.isSuccess(result)
    ? "success"
    : result.failure instanceof Conflict
      ? result.failure.reason
      : `unexpected failure: ${String(result.failure)}`;

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  await seedUser("alpha");
  await seedUser("beta");
  await seedUser("reviewer");
});
afterAll(() => runtime.dispose());

describe("guarded writes on D1", () => {
  it("two concurrent completeBootstrap calls: one success, one Conflict, one workspace, one admin", async () => {
    const results = await runtime.runPromise(
      Effect.flatMap(Bootstrap, (bootstrap) =>
        Effect.all(
          [
            Effect.result(
              bootstrap.complete(
                "alpha",
                new CompleteBootstrap({ workspaceName: "Alpha Co" }),
              ),
            ),
            Effect.result(
              bootstrap.complete(
                "beta",
                new CompleteBootstrap({ workspaceName: "Beta Co" }),
              ),
            ),
          ],
          { concurrency: "unbounded" },
        ),
      ),
    );
    const outcomes = results.map(outcome).sort();
    expect(outcomes).toEqual(["bootstrap-already-completed", "success"].sort());

    const rows = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        Effect.all({
          workspaces: db.select().from(workspace),
          settings: db.select().from(applicationSettings),
          admins: db.select().from(user).where(eq(user.role, "admin")),
        }),
      ),
    );
    expect(rows.workspaces).toHaveLength(1);
    expect(rows.settings).toHaveLength(1);
    expect(rows.settings[0]?.setupCompletedAt).toBeInstanceOf(Date);
    expect(rows.settings[0]?.initialWorkspaceId).toBe(rows.workspaces[0]?.id);
    expect(rows.admins).toHaveLength(1);

    const status = await runtime.runPromise(
      Effect.flatMap(Bootstrap, (bootstrap) => bootstrap.status),
    );
    expect(status).toMatchObject({ isInitialized: true, requiresSetup: false });
  });

  it("two concurrent approvals: one success, one Conflict(waitlist-status-changed), one allowlist row; a re-approval keeps it at one", async () => {
    const entry = await runtime
      .runPromise(
        Effect.flatMap(Database, ({ db }) =>
          db
            .insert(waitlistEntry)
            .values({ email: "race@example.com" })
            .returning(),
        ),
      )
      .then((rows) => rows[0]!);

    const results = await runtime.runPromise(
      Effect.flatMap(WaitlistReview, (review) =>
        Effect.all(
          [1, 2].map(() =>
            Effect.result(
              review.review(
                "reviewer",
                WaitlistEntryId.make(entry.id),
                new ReviewWaitlistEntry({ status: "approved" }),
              ),
            ),
          ),
          { concurrency: "unbounded" },
        ),
      ),
    );
    expect(results.map(outcome).sort()).toEqual(
      ["success", "waitlist-status-changed"].sort(),
    );

    const allowlist = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        db
          .select()
          .from(workspaceInviteAllowlist)
          .where(eq(workspaceInviteAllowlist.email, "race@example.com")),
      ),
    );
    expect(allowlist).toHaveLength(1);
    expect(allowlist[0]?.role).toBe("member");

    // The allowlist insert is idempotent: with the row already there, a
    // re-approval (once the entry is back to pending) succeeds and leaves
    // the count at one.
    await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        db
          .update(waitlistEntry)
          .set({ status: "pending" })
          .where(eq(waitlistEntry.id, entry.id)),
      ),
    );
    const again = await runtime.runPromise(
      Effect.flatMap(WaitlistReview, (review) =>
        Effect.result(
          review.review(
            "reviewer",
            WaitlistEntryId.make(entry.id),
            new ReviewWaitlistEntry({ status: "approved" }),
          ),
        ),
      ),
    );
    expect(outcome(again)).toBe("success");
    const [row] = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        db.select().from(waitlistEntry).where(eq(waitlistEntry.id, entry.id)),
      ),
    );
    expect(row?.status).toBe("approved");
    const after = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        db
          .select()
          .from(workspaceInviteAllowlist)
          .where(eq(workspaceInviteAllowlist.email, "race@example.com")),
      ),
    );
    expect(after).toHaveLength(1);
    expect(after[0]?.id).toBe(allowlist[0]?.id);
  });
});
