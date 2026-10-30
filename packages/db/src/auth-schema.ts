/**
 * better-auth's tables (1.7.14), hand-maintained on top of `auth generate`:
 * `pnpm -F @gmacko/auth generate` writes the CLI's version to
 * `packages/db/.cache/auth-schema.generated.ts` (never here); reconcile it
 * against this file rather than copying it verbatim. Deliberate
 * differences from the generated output:
 *   - column helpers (`bool`, `timestampMs`) instead of inline `integer(...)`;
 *   - `role` is NOT NULL DEFAULT 'user' (the CLI emits it nullable);
 *   - no DB-side `unixepoch()` defaults / `$onUpdate`: better-auth sets
 *     createdAt/updatedAt itself on every write;
 *   - relations live in relations.ts (drizzle v2 `defineRelations`), not the
 *     v1 `relations()` blocks the CLI appends.
 * Everything else (columns, NOT NULLs, indexes) must match the CLI output.
 *
 * Migration safety. `migrations/20260903035551_auth_1_7_issuer.sql` was
 * generated against an EMPTY database: it does `ALTER TABLE account ADD
 * issuer text NOT NULL` with no default (fails on any existing account row)
 * and rebuilds `user` and `verification` with drizzle-kit's `PRAGMA
 * foreign_keys=OFF` + `DROP TABLE` + rename recipe. D1 applies a migration as
 * one batch (a transaction) and SQLite ignores `PRAGMA foreign_keys` inside a
 * transaction, so the DROP cascades into `session`, `account`, `api_keys`,
 * ... (see `__tests__/migrations.workers.test.ts` for the proof). It must not
 * be reused or copied once a stage database exists. From then on every
 * schema change is expand/contract: add nullable or defaulted columns,
 * backfill, then tighten; never drop-and-recreate a table with rows behind
 * foreign keys. See packages/db/README.md, "Migrations".
 */
import {
  index,
  integer,
  sqliteTable,
  text,
  uniqueIndex,
} from "drizzle-orm/sqlite-core";

import { bool, timestampMs } from "./columns";

export const userRoleEnum = ["user", "admin"] as const;
export type UserRole = (typeof userRoleEnum)[number];

export const user = sqliteTable("user", {
  id: text().primaryKey(),
  name: text().notNull(),
  email: text().notNull().unique(),
  emailVerified: bool("email_verified").notNull().default(false),
  image: text(),
  role: text().$type<UserRole>().notNull().default("user"),
  createdAt: timestampMs("created_at").notNull(),
  updatedAt: timestampMs("updated_at").notNull(),
});

export const session = sqliteTable(
  "session",
  {
    id: text().primaryKey(),
    expiresAt: timestampMs("expires_at").notNull(),
    token: text().notNull().unique(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
  },
  (table) => [index("session_userId_idx").on(table.userId)],
);

export const account = sqliteTable(
  "account",
  {
    id: text().primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestampMs("access_token_expires_at"),
    refreshTokenExpiresAt: timestampMs("refresh_token_expires_at"),
    scope: text(),
    password: text(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [index("account_userId_idx").on(table.userId)],
);

export const verification = sqliteTable(
  "verification",
  {
    id: text().primaryKey(),
    identifier: text().notNull(),
    value: text().notNull(),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [index("verification_identifier_idx").on(table.identifier)],
);

export const deviceCodeStatusEnum = ["pending", "approved", "denied"] as const;
export type DeviceCodeStatus = (typeof deviceCodeStatusEnum)[number];

/**
 * RFC 8628 device-authorization grant (better-auth's `deviceAuthorization`
 * plugin; field names and NOT NULLs are the plugin's own schema). Backs the
 * mobile app's QR pairing and user-code sign-in. `deviceCode` and `userCode`
 * are single-use credentials the plugin looks up on every poll and approval:
 * unique gives the correctness AND the index for those hot paths. Rows past
 * `expires_at` are housekeeping for the nightly Cron tick
 * (`Jobs.pruneDeviceCodes`); the plugin only deletes the one it is asked for.
 */
export const deviceCode = sqliteTable("device_code", {
  id: text().primaryKey(),
  deviceCode: text("device_code").notNull().unique(),
  userCode: text("user_code").notNull().unique(),
  userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
  expiresAt: timestampMs("expires_at").notNull(),
  status: text().$type<DeviceCodeStatus>().notNull(),
  lastPolledAt: timestampMs("last_polled_at"),
  pollingInterval: integer("polling_interval"),
  clientId: text("client_id"),
  scope: text(),
});

// ---------------------------------------------------------------------------
// @better-auth/oauth-provider (1.7.14): the MCP endpoint's authorization
// server (packages/auth/src/oauth-provider.ts).
//
// Deliberate difference from the CLI output: the CLI declares the JSON
// columns (`scopes`, `resources`, `redirect_uris`, `metadata`, ...) as
// `text(..., { mode: "json" })`, but better-auth's drizzle adapter already
// serialises JSON fields on SQLite, so drizzle's json mode would encode them a
// second time (a JSON string of a JSON array). They are plain `text` here,
// with the same DDL, holding JSON text: readers outside better-auth
// (`OAuthTokens`) decode them with a Schema.
// ---------------------------------------------------------------------------

export const oauthClient = sqliteTable(
  "oauth_client",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id").notNull().unique(),
    clientSecret: text("client_secret"),
    clientDiscoveryId: text("client_discovery_id"),
    disabled: bool("disabled").default(false),
    skipConsent: bool("skip_consent"),
    enableEndSession: bool("enable_end_session"),
    subjectType: text("subject_type"),
    scopes: text("scopes"),
    clientCredentialsScopes: text("client_credentials_scopes").default("[]"),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    createdAt: timestampMs("created_at"),
    updatedAt: timestampMs("updated_at"),
    name: text("name"),
    uri: text("uri"),
    icon: text("icon"),
    contacts: text("contacts"),
    tos: text("tos"),
    policy: text("policy"),
    softwareId: text("software_id"),
    softwareVersion: text("software_version"),
    softwareStatement: text("software_statement"),
    redirectUris: text("redirect_uris").notNull(),
    postLogoutRedirectUris: text("post_logout_redirect_uris"),
    backchannelLogoutUri: text("backchannel_logout_uri"),
    backchannelLogoutSessionRequired: bool(
      "backchannel_logout_session_required",
    ),
    tokenEndpointAuthMethod: text("token_endpoint_auth_method"),
    applicationType: text("application_type"),
    jwks: text("jwks"),
    jwksUri: text("jwks_uri"),
    grantTypes: text("grant_types"),
    responseTypes: text("response_types"),
    requirePKCE: bool("require_pkce"),
    dpopBoundAccessTokens: bool("dpop_bound_access_tokens").default(false),
    referenceId: text("reference_id"),
    metadata: text("metadata"),
  },
  (table) => [index("oauthClient_userId_idx").on(table.userId)],
);

export const oauthResource = sqliteTable("oauth_resource", {
  id: text("id").primaryKey(),
  identifier: text("identifier").notNull().unique(),
  name: text("name").notNull(),
  accessTokenTtl: integer("access_token_ttl"),
  refreshTokenTtl: integer("refresh_token_ttl"),
  signingAlgorithm: text("signing_algorithm"),
  signingKeyId: text("signing_key_id"),
  allowedScopes: text("allowed_scopes"),
  customClaims: text("custom_claims"),
  dpopBoundAccessTokensRequired: bool(
    "dpop_bound_access_tokens_required",
  ).default(false),
  disabled: bool("disabled").default(false),
  createdAt: timestampMs("created_at"),
  updatedAt: timestampMs("updated_at"),
  policyVersion: integer("policy_version").default(1),
  metadata: text("metadata"),
});

export const oauthClientResource = sqliteTable(
  "oauth_client_resource",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    resourceId: text("resource_id")
      .notNull()
      .references(() => oauthResource.identifier, { onDelete: "cascade" }),
    metadata: text("metadata"),
    createdAt: timestampMs("created_at"),
  },
  (table) => [
    uniqueIndex("oauthClientResource_clientId_resourceId_uidx").on(
      table.clientId,
      table.resourceId,
    ),
    index("oauthClientResource_clientId_idx").on(table.clientId),
    index("oauthClientResource_resourceId_idx").on(table.resourceId),
  ],
);

export const oauthRefreshToken = sqliteTable(
  "oauth_refresh_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    revoked: timestampMs("revoked"),
    rotatedAt: timestampMs("rotated_at"),
    rotationReplayResponse: text("rotation_replay_response"),
    rotationReplayExpiresAt: timestampMs("rotation_replay_expires_at"),
    authTime: timestampMs("auth_time"),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  (table) => [
    index("oauthRefreshToken_clientId_idx").on(table.clientId),
    index("oauthRefreshToken_sessionId_idx").on(table.sessionId),
    index("oauthRefreshToken_userId_idx").on(table.userId),
    index("oauthRefreshToken_authorizationCodeId_idx").on(
      table.authorizationCodeId,
    ),
  ],
);

export const oauthAccessToken = sqliteTable(
  "oauth_access_token",
  {
    id: text("id").primaryKey(),
    token: text("token").notNull().unique(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    sessionId: text("session_id").references(() => session.id, {
      onDelete: "set null",
    }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    authorizationCodeId: text("authorization_code_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    refreshId: text("refresh_id").references(() => oauthRefreshToken.id, {
      onDelete: "cascade",
    }),
    expiresAt: timestampMs("expires_at").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    revoked: timestampMs("revoked"),
    confirmation: text("confirmation"),
    scopes: text("scopes").notNull(),
  },
  (table) => [
    index("oauthAccessToken_clientId_idx").on(table.clientId),
    index("oauthAccessToken_sessionId_idx").on(table.sessionId),
    index("oauthAccessToken_userId_idx").on(table.userId),
    index("oauthAccessToken_authorizationCodeId_idx").on(
      table.authorizationCodeId,
    ),
    index("oauthAccessToken_refreshId_idx").on(table.refreshId),
  ],
);

export const oauthConsent = sqliteTable(
  "oauth_consent",
  {
    id: text("id").primaryKey(),
    clientId: text("client_id")
      .notNull()
      .references(() => oauthClient.clientId, { onDelete: "cascade" }),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    referenceId: text("reference_id"),
    resources: text("resources"),
    requestedUserInfoClaims: text("requested_user_info_claims"),
    scopes: text("scopes").notNull(),
    createdAt: timestampMs("created_at").notNull(),
    updatedAt: timestampMs("updated_at").notNull(),
  },
  (table) => [
    index("oauthConsent_clientId_idx").on(table.clientId),
    index("oauthConsent_userId_idx").on(table.userId),
  ],
);

export const oauthClientAssertion = sqliteTable("oauth_client_assertion", {
  id: text("id").primaryKey(),
  expiresAt: timestampMs("expires_at").notNull(),
});
