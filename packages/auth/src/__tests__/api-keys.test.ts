/**
 * `ApiKeys`: WebCrypto generation and hashing (byte-for-byte the legacy
 * `sha256(key).hex` format, so existing keys keep working), and the
 * authenticate / list / create / revoke operations over `Database.layerTest`.
 */
import { createHash } from "node:crypto";

import { Database, DatabaseError } from "@gmacko/db";
import { apiKeys, user } from "@gmacko/db/schema";
import { layerTest } from "@gmacko/db/testing";
import { eq } from "drizzle-orm";
import { Effect, Layer, ManagedRuntime } from "effect";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { ApiKeys } from "../api-keys";

const legacyHash = (key: string): string =>
  createHash("sha256").update(key).digest("hex");

describe("ApiKeys", () => {
  let runtime: ManagedRuntime.ManagedRuntime<ApiKeys | Database, never>;
  const run = <A, E>(effect: Effect.Effect<A, E, ApiKeys | Database>) =>
    runtime.runPromise(effect);

  beforeAll(() => {
    runtime = ManagedRuntime.make(Layer.provideMerge(ApiKeys.layer, layerTest));
  });
  afterAll(() => runtime.dispose());

  const insertUser = (email: string) =>
    Effect.flatMap(Database, ({ db }) =>
      db
        .insert(user)
        .values({
          id: crypto.randomUUID(),
          name: email.split("@")[0] ?? email,
          email,
          emailVerified: true,
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning(),
    ).pipe(Effect.map((rows) => rows[0]!));

  describe("hash", () => {
    it("matches the legacy createHash('sha256').digest('hex') format", async () => {
      const keys = yieldKeys();
      const hashed = await run(
        Effect.flatMap(ApiKeys, (api) =>
          Effect.forEach(keys, (key) => api.hash(key)),
        ),
      );
      expect(hashed).toEqual(keys.map(legacyHash));
      // Known SHA-256 vector, independent of node:crypto.
      expect(await run(Effect.flatMap(ApiKeys, (api) => api.hash("abc")))).toBe(
        "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad",
      );
    });
  });

  describe("generate", () => {
    it("mints gmk_ + base64url(32 bytes), the 12-char prefix and the sha256 hex hash", async () => {
      const generated = await run(
        Effect.flatMap(ApiKeys, (api) => api.generate),
      );
      // 4 chars of "gmk_" + 43 chars of unpadded base64url for 32 bytes.
      expect(generated.secret).toMatch(/^gmk_[A-Za-z0-9_-]{43}$/);
      expect(generated.prefix).toBe(generated.secret.slice(0, 12));
      expect(generated.hash).toBe(legacyHash(generated.secret));
    });

    it("never repeats", async () => {
      const secrets = await run(
        Effect.flatMap(ApiKeys, (api) =>
          Effect.forEach(Array.from({ length: 20 }), () => api.generate),
        ),
      );
      expect(new Set(secrets.map((s) => s.secret)).size).toBe(20);
    });
  });

  describe("create / list / revoke", () => {
    it("returns the plaintext once, lists without it, revokes only the owner's key", async () => {
      const result = await run(
        Effect.gen(function* () {
          const api = yield* ApiKeys;
          const { db } = yield* Database;
          const owner = yield* insertUser(
            `owner-${crypto.randomUUID()}@example.com`,
          );
          const other = yield* insertUser(
            `other-${crypto.randomUUID()}@example.com`,
          );

          const created = yield* api.create(owner.id, {
            name: "ci",
            permissions: ["read", "write"],
          });
          const listed = yield* api.list(owner.id);
          const stored = yield* db
            .select()
            .from(apiKeys)
            .where(eq(apiKeys.id, created.id));

          const foreign = yield* api
            .revoke(other.id, created.id)
            .pipe(Effect.result);
          const listedAfterForeign = yield* api.list(owner.id);
          yield* api.revoke(owner.id, created.id);
          const listedAfterRevoke = yield* api.list(owner.id);
          const again = yield* api
            .revoke(owner.id, created.id)
            .pipe(Effect.result);

          return {
            created,
            listed,
            stored: stored[0],
            foreign,
            listedAfterForeign,
            listedAfterRevoke,
            again,
          };
        }),
      );

      expect(result.created.key).toMatch(/^gmk_/);
      expect(result.created.keyPrefix).toBe(result.created.key.slice(0, 12));
      expect(result.created.permissions).toEqual(["read", "write"]);
      expect(result.created.expiresAt).toBeNull();

      expect(result.listed).toHaveLength(1);
      expect(result.listed[0]).toMatchObject({
        id: result.created.id,
        name: "ci",
        keyPrefix: result.created.keyPrefix,
        permissions: ["read", "write"],
        lastUsedAt: null,
        expiresAt: null,
      });
      expect(JSON.stringify(result.listed)).not.toContain(result.created.key);

      // The row holds the stored hash format, never the secret.
      expect(result.stored?.keyHash).toBe(legacyHash(result.created.key));

      expect(result.foreign._tag).toBe("Failure");
      if (result.foreign._tag === "Failure") {
        expect(result.foreign.failure).toMatchObject({
          _tag: "NotFound",
          resource: "apiKey",
          id: result.created.id,
        });
      }
      expect(result.listedAfterForeign).toHaveLength(1);
      expect(result.listedAfterRevoke).toHaveLength(0);
      expect(result.again._tag).toBe("Failure");
    });

    it("sets expiresAt when asked", async () => {
      const expiresAt = new Date(Date.now() + 86_400_000);
      const created = await run(
        Effect.gen(function* () {
          const api = yield* ApiKeys;
          const owner = yield* insertUser(
            `exp-${crypto.randomUUID()}@example.com`,
          );
          return yield* api.create(owner.id, {
            name: "expiring",
            permissions: ["read"],
            expiresAt,
          });
        }),
      );
      expect(created.expiresAt?.getTime()).toBe(expiresAt.getTime());
    });
  });

  describe("authenticate", () => {
    it("resolves a live key to its user and permissions and touches lastUsedAt", async () => {
      const result = await run(
        Effect.gen(function* () {
          const api = yield* ApiKeys;
          const owner = yield* insertUser(
            `auth-${crypto.randomUUID()}@example.com`,
          );
          const created = yield* api.create(owner.id, {
            name: "live",
            permissions: ["read"],
          });
          const before = yield* api.list(owner.id);
          const authenticated = yield* api.authenticate(created.key);
          const after = yield* api.list(owner.id);
          return { owner, created, before, authenticated, after };
        }),
      );
      expect(result.authenticated.keyId).toBe(result.created.id);
      expect(result.authenticated.permissions).toEqual(["read"]);
      expect(result.authenticated.user.id).toBe(result.owner.id);
      expect(result.authenticated.user.email).toBe(result.owner.email);
      expect(result.authenticated.user.role).toBe("user");
      expect(result.before[0]?.lastUsedAt).toBeNull();
      expect(result.after[0]?.lastUsedAt).toBeInstanceOf(Date);
    });

    it("refuses unknown, malformed, expired and revoked keys with Unauthorized, without touching lastUsedAt", async () => {
      const result = await run(
        Effect.gen(function* () {
          const api = yield* ApiKeys;
          const { db } = yield* Database;
          const owner = yield* insertUser(
            `bad-${crypto.randomUUID()}@example.com`,
          );
          const expired = yield* api.create(owner.id, {
            name: "expired",
            permissions: ["admin"],
            expiresAt: new Date(Date.now() - 1000),
          });
          const revoked = yield* api.create(owner.id, {
            name: "revoked",
            permissions: ["admin"],
          });
          yield* api.revoke(owner.id, revoked.id);

          const attempts = yield* Effect.forEach(
            [
              "gmk_definitely-not-a-key",
              "not-even-prefixed",
              "",
              expired.key,
              revoked.key,
            ],
            (key) => api.authenticate(key).pipe(Effect.result),
          );
          const rows = yield* db
            .select({ id: apiKeys.id, lastUsedAt: apiKeys.lastUsedAt })
            .from(apiKeys)
            .where(eq(apiKeys.userId, owner.id));
          return { attempts, rows };
        }),
      );
      for (const attempt of result.attempts) {
        expect(attempt._tag).toBe("Failure");
        if (attempt._tag === "Failure") {
          expect(attempt.failure._tag).toBe("Unauthorized");
        }
      }
      expect(result.rows).toHaveLength(2);
      for (const row of result.rows) expect(row.lastUsedAt).toBeNull();
    });

    it("still authenticates when the lastUsedAt touch fails: the write is best effort", async () => {
      const hiccup = new DatabaseError({
        reason: "other",
        cause: new Error("write hiccup"),
      });
      // The same database, with every `db.update(...)` failing: reads and
      // inserts go through untouched, so the key can be minted and found.
      const FailingUpdates = Layer.effect(Database)(
        Effect.map(Database, (database) => ({
          ...database,
          db: new Proxy(database.db, {
            get: (target, property, receiver) =>
              property === "update"
                ? () => ({ set: () => ({ where: () => Effect.fail(hiccup) }) })
                : Reflect.get(target, property, receiver),
          }),
        })),
      ).pipe(Layer.provide(layerTest));
      const flaky = ManagedRuntime.make(
        Layer.provideMerge(ApiKeys.layer, FailingUpdates),
      );
      try {
        const result = await flaky.runPromise(
          Effect.gen(function* () {
            const api = yield* ApiKeys;
            const owner = yield* insertUser(
              `flaky-${crypto.randomUUID()}@example.com`,
            );
            const created = yield* api.create(owner.id, {
              name: "flaky",
              permissions: ["read"],
            });
            const authenticated = yield* api.authenticate(created.key);
            const listed = yield* api.list(owner.id);
            return { created, authenticated, listed };
          }),
        );
        expect(result.authenticated.keyId).toBe(result.created.id);
        expect(result.authenticated.permissions).toEqual(["read"]);
        expect(result.listed[0]?.lastUsedAt).toBeNull();
      } finally {
        await flaky.dispose();
      }
    });
  });
});

/** A handful of keys shaped like the real ones, for the parity check. */
function yieldKeys(): ReadonlyArray<string> {
  return [
    "gmk_AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA",
    "gmk_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-_-",
    "gmk_9f86d081884c7d659a2feaa0c55ad015a3bf4f1b2",
    "gmk_",
  ];
}
