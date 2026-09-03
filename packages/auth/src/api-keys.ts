/**
 * `ApiKeys`: the `gmk_` bearer keys. Secrets are minted and hashed with
 * WebCrypto (Workers-safe, no `node:crypto`) in exactly the legacy format —
 * `"gmk_" + base64url(32 random bytes)`, stored as `sha256(secret)` hex with
 * the first 12 characters as a display prefix — so keys issued by the old
 * stack keep authenticating.
 *
 * `authenticate` is the only read path the middlewares use. An unknown,
 * malformed, expired or revoked key is `Unauthorized`; the caller never falls
 * through to another credential (docs/API_AUTH.md, rule 2). `lastUsedAt` is
 * touched only when the key authenticates, and best effort: a failed touch
 * is logged, never raised.
 */
import { Database, type DatabaseError } from "@gmacko/db";
import { apiKeys, user } from "@gmacko/db/schema";
import {
  ApiKey,
  ApiKeyCreated,
  type ApiKeyId,
  ApiKeyScope,
  NotFound,
  Unauthorized,
  type User,
} from "@gmacko/domain";
import { and, desc, eq, isNull } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

import { toUser } from "./user";

export const KEY_PREFIX = "gmk_";
const PREFIX_LENGTH = 12;
const SECRET_BYTES = 32;

export interface GeneratedKey {
  /** The plaintext, shown to the user once. */
  readonly secret: string;
  /** `secret.slice(0, 12)`, stored for recognising the key in a list. */
  readonly prefix: string;
  /** `sha256(secret)` as lowercase hex; the only thing the row keeps. */
  readonly hash: string;
}

export interface AuthenticatedKey {
  readonly keyId: ApiKeyId;
  readonly user: User;
  readonly permissions: ReadonlyArray<ApiKeyScope>;
}

export interface CreateApiKeyInput {
  readonly name: string;
  readonly permissions: ReadonlyArray<ApiKeyScope>;
  readonly expiresAt?: Date | undefined;
}

export interface ApiKeysShape {
  readonly generate: Effect.Effect<GeneratedKey>;
  readonly hash: (secret: string) => Effect.Effect<string>;
  /**
   * `Unauthorized` for an unknown, malformed, expired or revoked key.
   * `lastUsedAt` is touched on every successful authentication — even when
   * a later scope or role check refuses the request: the key was presented
   * and recognised, which is what the timestamp records. The touch is best
   * effort: a `DatabaseError` on the write is logged and the key still
   * authenticates.
   */
  readonly authenticate: (
    bearer: string,
  ) => Effect.Effect<AuthenticatedKey, Unauthorized | DatabaseError>;
  readonly list: (
    userId: string,
  ) => Effect.Effect<ReadonlyArray<ApiKey>, DatabaseError>;
  readonly create: (
    userId: string,
    input: CreateApiKeyInput,
  ) => Effect.Effect<ApiKeyCreated, DatabaseError>;
  /** `NotFound` when the key does not exist, is already revoked, or belongs to someone else. */
  readonly revoke: (
    userId: string,
    keyId: string,
  ) => Effect.Effect<void, NotFound | DatabaseError>;
}

const encoder = new TextEncoder();

const toHex = (bytes: Uint8Array): string =>
  Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");

const toBase64Url = (bytes: Uint8Array): string =>
  btoa(String.fromCharCode(...bytes))
    .replaceAll("+", "-")
    .replaceAll("/", "_")
    .replace(/=+$/, "");

/** Same bytes, same encoding as `createHash("sha256").update(key).digest("hex")`. */
export const hashSecret = (secret: string): Effect.Effect<string> =>
  Effect.promise(() =>
    crypto.subtle.digest("SHA-256", encoder.encode(secret)),
  ).pipe(Effect.map((digest) => toHex(new Uint8Array(digest))));

export const generateKey: Effect.Effect<GeneratedKey> = Effect.gen(
  function* () {
    const bytes = crypto.getRandomValues(new Uint8Array(SECRET_BYTES));
    const secret = `${KEY_PREFIX}${toBase64Url(bytes)}`;
    const hash = yield* hashSecret(secret);
    return { secret, prefix: secret.slice(0, PREFIX_LENGTH), hash };
  },
);

/** The stored `permissions` JSON is untyped `string[]`; keep only real scopes. */
const toScopes = (
  permissions: ReadonlyArray<string>,
): ReadonlyArray<ApiKeyScope> =>
  permissions.filter((value): value is ApiKeyScope =>
    (ApiKeyScope.literals as ReadonlyArray<string>).includes(value),
  );

export class ApiKeys extends Context.Service<ApiKeys, ApiKeysShape>()(
  "@gmacko/auth/ApiKeys",
) {
  static layer: Layer.Layer<ApiKeys, never, Database> = Layer.effect(ApiKeys)(
    Effect.map(Database, ({ db, updateWhere }) =>
      ApiKeys.of({
        generate: generateKey,
        hash: hashSecret,
        authenticate: (bearer) =>
          Effect.gen(function* () {
            if (!bearer.startsWith(KEY_PREFIX)) {
              return yield* new Unauthorized();
            }
            const hash = yield* hashSecret(bearer);
            // One read: the live key and its owner together.
            const rows = yield* db
              .select({ key: apiKeys, owner: user })
              .from(apiKeys)
              .innerJoin(user, eq(user.id, apiKeys.userId))
              .where(and(eq(apiKeys.keyHash, hash), isNull(apiKeys.revokedAt)))
              .limit(1);
            const match = rows[0];
            if (match === undefined) return yield* new Unauthorized();
            const { key, owner } = match;
            if (key.expiresAt !== null && key.expiresAt < new Date()) {
              return yield* new Unauthorized();
            }
            // Best effort: the key has authenticated; a write hiccup here
            // must not turn a valid read into a 500.
            yield* db
              .update(apiKeys)
              .set({ lastUsedAt: new Date() })
              .where(eq(apiKeys.id, key.id))
              .pipe(
                Effect.catchTag("DatabaseError", (error: DatabaseError) =>
                  Effect.logWarning("api key lastUsedAt touch failed", error),
                ),
              );
            return {
              keyId: key.id as ApiKeyId,
              user: toUser(owner),
              permissions: toScopes(key.permissions),
            };
          }),
        list: (userId) =>
          db
            .select()
            .from(apiKeys)
            .where(and(eq(apiKeys.userId, userId), isNull(apiKeys.revokedAt)))
            .orderBy(desc(apiKeys.createdAt), desc(apiKeys.id))
            .pipe(
              Effect.map((rows) =>
                rows.map(
                  (row) =>
                    new ApiKey({
                      id: row.id as ApiKeyId,
                      name: row.name,
                      keyPrefix: row.keyPrefix,
                      permissions: toScopes(row.permissions),
                      lastUsedAt: row.lastUsedAt,
                      expiresAt: row.expiresAt,
                      createdAt: row.createdAt,
                    }),
                ),
              ),
            ),
        create: (userId, input) =>
          Effect.gen(function* () {
            const generated = yield* generateKey;
            const rows = yield* db
              .insert(apiKeys)
              .values({
                userId,
                name: input.name,
                keyHash: generated.hash,
                keyPrefix: generated.prefix,
                permissions: [...input.permissions],
                expiresAt: input.expiresAt ?? null,
              })
              .returning({
                id: apiKeys.id,
                name: apiKeys.name,
                keyPrefix: apiKeys.keyPrefix,
                permissions: apiKeys.permissions,
                expiresAt: apiKeys.expiresAt,
              });
            const row = rows[0];
            if (row === undefined) {
              return yield* Effect.die(
                new Error("api_keys insert returned no row"),
              );
            }
            return new ApiKeyCreated({
              id: row.id as ApiKeyId,
              name: row.name,
              keyPrefix: row.keyPrefix,
              permissions: toScopes(row.permissions),
              expiresAt: row.expiresAt,
              key: generated.secret,
            });
          }),
        revoke: (userId, keyId) =>
          updateWhere(
            db
              .update(apiKeys)
              .set({ revokedAt: new Date() })
              .where(
                and(
                  eq(apiKeys.id, keyId),
                  eq(apiKeys.userId, userId),
                  isNull(apiKeys.revokedAt),
                ),
              ),
          ).pipe(
            Effect.flatMap((changed) =>
              changed === 0
                ? Effect.fail(new NotFound({ resource: "apiKey", id: keyId }))
                : Effect.void,
            ),
          ),
      }),
    ),
  );
}
