/**
 * The two live `RateLimiter` layers on workerd (Miniflare,
 * `@cloudflare/vitest-pool-workers`):
 *
 * - `layerCloudflare` over a real Rate Limiting binding — Miniflare
 *   implements `ratelimits`, so the 429 here comes from workerd's own
 *   counter, not a stub;
 * - `layerD1` over a real D1, where the guarded upsert is the thing under
 *   test: the third call in a window has to come back with no rows.
 *
 * The two are wired the way apps/web wires them: one scope with a binding,
 * one (`signup`) deliberately without, falling through to D1.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { Database } from "@gmacko/db";
import { rateLimitWindow } from "@gmacko/db/schema";
import { RateLimited } from "@gmacko/domain";
import { Cause, Effect, Exit, Layer, ManagedRuntime, Option } from "effect";
import { beforeAll, describe, expect, it } from "vitest";

import { Jobs } from "./jobs";
import { defaultRateLimits, RateLimiter, type RateLimits } from "./rate-limit";

const DatabaseLive = Database.layer(env.DB);

/** Matches the Miniflare `ratelimits` options in vitest.workers.config.ts. */
const limits: RateLimits = {
  ...defaultRateLimits,
  contact: { limit: 2, windowMs: 60_000 },
  signup: { limit: 2, windowMs: 60_000 },
};

const RateLimiterLive = RateLimiter.layerCloudflare({
  bindings: { contact: env.RATE_LIMIT_CONTACT },
  limits,
}).pipe(Layer.provide(DatabaseLive));

const runtime = ManagedRuntime.make(
  Layer.mergeAll(
    DatabaseLive,
    RateLimiterLive,
    Jobs.layer.pipe(Layer.provide(DatabaseLive)),
  ),
);

const consume = (scope: "contact" | "signup", client: string) =>
  runtime.runPromiseExit(
    Effect.flatMap(RateLimiter, (limiter) => limiter.consume(scope, client)),
  );

/** The `RateLimited` a refused `consume` failed with, or `undefined`. */
const refusalOf = (
  exit: Exit.Exit<void, RateLimited>,
): RateLimited | undefined =>
  Exit.isFailure(exit)
    ? Option.getOrUndefined(Cause.findErrorOption(exit.cause))
    : undefined;

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

describe("the Cloudflare Rate Limiting binding", () => {
  it("allows the allowance and refuses with RateLimited after it", async () => {
    const client = `ip:${crypto.randomUUID()}`;
    expect(Exit.isSuccess(await consume("contact", client))).toBe(true);
    expect(Exit.isSuccess(await consume("contact", client))).toBe(true);
    const refused = refusalOf(await consume("contact", client));
    expect(refused).toBeInstanceOf(RateLimited);
    expect(refused?.retryAfterSeconds).toBe(60);
  });

  it("counts each client separately", async () => {
    const one = `ip:${crypto.randomUUID()}`;
    const two = `ip:${crypto.randomUUID()}`;
    await consume("contact", one);
    await consume("contact", one);
    expect(Exit.isFailure(await consume("contact", one))).toBe(true);
    expect(Exit.isSuccess(await consume("contact", two))).toBe(true);
  });
});

describe("the D1 counter behind a scope with no binding", () => {
  it("refuses the call after the allowance and writes one row per window", async () => {
    const client = `ip:${crypto.randomUUID()}`;
    expect(Exit.isSuccess(await consume("signup", client))).toBe(true);
    expect(Exit.isSuccess(await consume("signup", client))).toBe(true);
    expect(Exit.isFailure(await consume("signup", client))).toBe(true);

    const rows = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) => db.select().from(rateLimitWindow)),
    );
    const mine = rows.filter((row) => row.key.includes(client));
    expect(mine).toHaveLength(1);
    // The refused call does not increment past the limit.
    expect(mine[0]?.count).toBe(2);
    expect(mine[0]?.scope).toBe("signup");
  });

  it("keeps a refusal's Retry-After inside the window", async () => {
    const client = `ip:${crypto.randomUUID()}`;
    await consume("signup", client);
    await consume("signup", client);
    const refused = refusalOf(await consume("signup", client));
    expect(refused).toBeInstanceOf(RateLimited);
    expect(refused?.retryAfterSeconds).toBeGreaterThan(0);
    expect(refused?.retryAfterSeconds).toBeLessThanOrEqual(60);
  });
});

describe("Jobs.pruneRateLimitWindows", () => {
  it("deletes closed windows and leaves the open ones", async () => {
    const client = `ip:${crypto.randomUUID()}`;
    await consume("signup", client);
    await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) =>
        db.insert(rateLimitWindow).values({
          key: `signup:${client}:stale`,
          scope: "signup",
          count: 9,
          expiresAt: new Date(Date.now() - 60_000),
        }),
      ),
    );
    const deleted = await runtime.runPromise(
      Effect.flatMap(Jobs, (jobs) => jobs.pruneRateLimitWindows),
    );
    expect(deleted).toBeGreaterThanOrEqual(1);
    const rows = await runtime.runPromise(
      Effect.flatMap(Database, ({ db }) => db.select().from(rateLimitWindow)),
    );
    expect(rows.some((row) => row.key.endsWith(":stale"))).toBe(false);
    expect(rows.some((row) => row.key.includes(client))).toBe(true);
  });
});
