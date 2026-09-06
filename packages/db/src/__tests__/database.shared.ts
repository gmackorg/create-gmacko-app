/**
 * The Database service contract, run against a caller-supplied layer so the
 * exact same assertions cover sqlite-node (`pnpm test`) and real local D1
 * through vitest-pool-workers (`pnpm test:workers`).
 */
import { and, sql as dsql, eq, isNull } from "drizzle-orm";
import { Effect, type Layer, ManagedRuntime, Schema } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { Database, DatabaseError } from "../database";
import {
  applicationSettings,
  Post,
  user,
  workspace,
  workspaceMembership,
} from "../schema";

class NotFound extends Schema.TaggedError<NotFound>()("NotFound", {}) {}

const unique = (prefix: string) => `${prefix}-${crypto.randomUUID()}`;

const insertUser = (email: string) =>
  Effect.gen(function* () {
    const { db, first } = yield* Database;
    const now = new Date();
    return yield* first(
      db
        .insert(user)
        .values({
          id: crypto.randomUUID(),
          name: "Test",
          email,
          emailVerified: true,
          createdAt: now,
          updatedAt: now,
        })
        .returning({ id: user.id, email: user.email }),
      () => new NotFound(),
    );
  });

export const databaseSuite = (
  name: string,
  layer: Layer.Layer<Database>,
): void => {
  describe(`Database (${name})`, () => {
    let runtime: ManagedRuntime.ManagedRuntime<Database, never>;
    const run = <A, E>(effect: Effect.Effect<A, E, Database>) =>
      runtime.runPromise(effect);

    beforeAll(() => {
      runtime = ManagedRuntime.make(layer);
    });
    afterAll(() => runtime.dispose());

    describe("plain", () => {
      it("is a promise drizzle over the same database (better-auth's adapter input)", async () => {
        const title = unique("plain");
        const seen = await run(
          Effect.gen(function* () {
            const { db, plain } = yield* Database;
            // Written through the promise flavour...
            yield* Effect.promise(() =>
              plain.insert(Post).values({ title, content: "via plain" }),
            );
            const viaPlain = yield* Effect.promise(() =>
              plain.select().from(Post).where(eq(Post.title, title)),
            );
            // ...visible through the Effect flavour: one database.
            const viaEffect = yield* db
              .select()
              .from(Post)
              .where(eq(Post.title, title));
            const single = yield* Effect.promise(() =>
              plain.select().from(Post).where(eq(Post.title, title)).get(),
            );
            return { viaPlain, viaEffect, single };
          }),
        );
        expect(seen.viaPlain).toHaveLength(1);
        expect(seen.viaEffect).toHaveLength(1);
        expect(seen.viaPlain[0]?.content).toBe("via plain");
        expect(seen.single?.title).toBe(title);
      });
    });

    describe("first", () => {
      it("returns the first row with the builder's inferred type", async () => {
        const row = await run(
          Effect.gen(function* () {
            const { db, first } = yield* Database;
            const inserted = yield* first(
              db
                .insert(Post)
                .values({ title: "hello", content: "world" })
                .returning(),
              () => new NotFound(),
            );
            const found = yield* first(
              db.select().from(Post).where(eq(Post.id, inserted.id)),
              () => new NotFound(),
            );
            // Inferred row type survives the DatabaseError wrapper.
            const title: string = found.title;
            const createdAt: Date = found.createdAt;
            return { title, createdAt, id: found.id };
          }),
        );
        expect(row.title).toBe("hello");
        expect(row.createdAt).toBeInstanceOf(Date);
        expect(row.id).toBeTypeOf("string");
      });

      it("fails with the caller's typed error on zero rows", async () => {
        const result = await run(
          Effect.gen(function* () {
            const { db, first } = yield* Database;
            return yield* first(
              db.select().from(Post).where(eq(Post.id, "missing")),
              () => new NotFound(),
            );
          }).pipe(Effect.result),
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure._tag).toBe("NotFound");
        }
      });

      it("passes driver failures through as DatabaseError, not the typed error", async () => {
        const result = await run(
          Effect.gen(function* () {
            const { db, first } = yield* Database;
            return yield* first(
              db.all<{ x: number }>(dsql`select x from no_such_table`),
              () => new NotFound(),
            );
          }).pipe(Effect.result),
        );
        expect(result._tag).toBe("Failure");
        if (result._tag === "Failure") {
          expect(result.failure._tag).toBe("DatabaseError");
          expect(result.failure).toBeInstanceOf(DatabaseError);
          // A missing table is a schema problem (unapplied migration), not
          // a syntax error, on both drivers. (`expect` does not narrow.)
          if (result.failure._tag === "DatabaseError") {
            expect(result.failure.reason).toBe("schema");
          }
        }
      });

      it("classifies a unique violation", async () => {
        const email = unique("dup");
        const result = await run(
          Effect.gen(function* () {
            yield* insertUser(email);
            return yield* insertUser(email);
          }).pipe(Effect.result),
        );
        expect(result._tag).toBe("Failure");
        if (
          result._tag === "Failure" &&
          result.failure._tag === "DatabaseError"
        ) {
          expect(result.failure.reason).toBe("unique");
        } else {
          throw new Error("expected DatabaseError");
        }
      });
    });

    describe("batch", () => {
      it("runs every statement and returns one row set per statement", async () => {
        const rows = await run(
          Effect.gen(function* () {
            const { db, batch } = yield* Database;
            const a = crypto.randomUUID();
            const b = crypto.randomUUID();
            const results = yield* batch([
              db.insert(Post).values({ id: a, title: "a", content: "a" }),
              db
                .insert(Post)
                .values({ id: b, title: "b", content: "b" })
                .returning({ id: Post.id }),
            ]);
            const both = yield* db
              .select({ id: Post.id })
              .from(Post)
              .where(dsql`${Post.id} in (${a}, ${b})`);
            return { results, count: both.length, b };
          }),
        );
        expect(rows.results).toHaveLength(2);
        expect(rows.results[1]).toEqual([{ id: rows.b }]);
        expect(rows.count).toBe(2);
      });

      it("is atomic: a failing second statement rolls back the first", async () => {
        const email = unique("batch");
        const postId = crypto.randomUUID();
        const outcome = await run(
          Effect.gen(function* () {
            const { db, batch } = yield* Database;
            const existing = yield* insertUser(email);
            const now = new Date();
            const result = yield* batch([
              db
                .insert(Post)
                .values({ id: postId, title: "orphan", content: "" }),
              db.insert(user).values({
                id: crypto.randomUUID(),
                name: "Dup",
                email: existing.email,
                emailVerified: false,
                createdAt: now,
                updatedAt: now,
              }),
            ]).pipe(Effect.result);
            const orphan = yield* db
              .select({ id: Post.id })
              .from(Post)
              .where(eq(Post.id, postId));
            return { result, orphan };
          }),
        );
        expect(outcome.result._tag).toBe("Failure");
        if (outcome.result._tag === "Failure") {
          expect(outcome.result.failure._tag).toBe("DatabaseError");
          expect(outcome.result.failure.reason).toBe("unique");
        }
        expect(outcome.orphan).toHaveLength(0);
      });
    });

    describe("updateWhere (guarded write)", () => {
      it("returns 1 when the guard matches and 0 on the identical second call", async () => {
        const counts = await run(
          Effect.gen(function* () {
            const { db, first, updateWhere } = yield* Database;
            const settings = yield* first(
              db.insert(applicationSettings).values({}).returning({
                id: applicationSettings.id,
              }),
              () => new NotFound(),
            );
            const complete = () =>
              updateWhere(
                db
                  .update(applicationSettings)
                  .set({ setupCompletedAt: new Date() })
                  .where(
                    and(
                      eq(applicationSettings.id, settings.id),
                      isNull(applicationSettings.setupCompletedAt),
                    ),
                  ),
              );
            const firstCall = yield* complete();
            const secondCall = yield* complete();
            return [firstCall, secondCall];
          }),
        );
        expect(counts).toEqual([1, 0]);
      });

      it("fails with DatabaseError when the write violates a constraint", async () => {
        const result = await run(
          Effect.gen(function* () {
            const { db, updateWhere } = yield* Database;
            const a = yield* insertUser(unique("a"));
            const b = yield* insertUser(unique("b"));
            return yield* updateWhere(
              db.update(user).set({ email: a.email }).where(eq(user.id, b.id)),
            );
          }).pipe(Effect.result),
        );
        expect(result._tag).toBe("Failure");
        if (
          result._tag === "Failure" &&
          result.failure._tag === "DatabaseError"
        ) {
          expect(result.failure.reason).toBe("unique");
        } else {
          throw new Error("expected DatabaseError");
        }
      });
    });

    it("ping reports a non-negative latency in ms", async () => {
      const latency = await run(Effect.flatMap(Database, (d) => d.ping));
      expect(Number.isFinite(latency)).toBe(true);
      expect(latency).toBeGreaterThanOrEqual(0);
    });

    it("supports relational queries with nested relations", async () => {
      const found = await run(
        Effect.gen(function* () {
          const { db, first } = yield* Database;
          const owner = yield* insertUser(unique("owner"));
          const ws = yield* first(
            db
              .insert(workspace)
              .values({
                name: "Acme",
                slug: unique("acme"),
                ownerUserId: owner.id,
              })
              .returning({ id: workspace.id }),
            () => new NotFound(),
          );
          yield* db.insert(workspaceMembership).values({
            workspaceId: ws.id,
            userId: owner.id,
            role: "owner",
          });
          return yield* db.query.workspace.findFirst({
            where: { id: ws.id },
            with: { owner: true, memberships: true },
          });
        }),
      );
      expect(found).toBeDefined();
      expect(found?.owner?.email).toMatch(/^owner-/);
      expect(found?.memberships).toHaveLength(1);
      expect(found?.memberships[0]?.role).toBe("owner");
    });

    it("does not expose transactions", async () => {
      const db = await run(Effect.map(Database, (d) => d.db));
      // @ts-expect-error transaction is removed from the service's db type
      const attempt = db.transaction;
      expect(attempt).toBeTypeOf("function");
      // SAFETY: the assertion above has just established that `attempt` is a
      // function, and `rewire` installed it as the arity-1 thunk-taker that
      // `Effect.die`s -- the very shape this call proves at runtime. It has no
      // static type because the service's `db` deliberately omits
      // `transaction` (hence the `@ts-expect-error` above).
      const call = attempt as (
        f: () => Effect.Effect<void>,
      ) => Effect.Effect<void>;
      await expect(run(call(() => Effect.void))).rejects.toThrow(
        /interactive transactions/,
      );
    });
  });
};
