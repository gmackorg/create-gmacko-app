/**
 * Row models: one `Model.Class` per `@gmacko/db` table, the single source of
 * truth for that table's shape inside the contract package.
 *
 * A model derives six schemas from one declaration — `select`, `insert`,
 * `update` for the database and `json`, `jsonCreate`, `jsonUpdate` for the
 * API. The contract classes in `auth/`, `posts/`, `settings/` and `admin/`
 * are `Schema.Class`es over the `json` variant, so a column marked
 * `Model.Sensitive` (an API key hash, a Stripe customer id) cannot reach the
 * wire by accident, and `Model.GeneratedByApp` keeps generated ids and audit
 * timestamps out of the create/update payloads.
 *
 * Two deliberate deviations from the `Model` field helpers:
 *
 * - Timestamps are `Schema.Date`, not `Model.DateTime*`. Drizzle's
 *   `timestamp_ms` columns already decode to `Date` before a row reaches a
 *   model, and the `Model.DateTime*` fields would retype every consumer's
 *   `createdAt` as `DateTime.Utc` for no change on the wire (both encode to a
 *   string).
 * - Booleans and JSON columns are `Schema.Boolean` / `Schema.Array`, not
 *   `Model.BooleanSqlite` / `Model.JsonFromString`, for the same reason:
 *   Drizzle's `mode: "boolean"` and `mode: "json"` columns do that decoding.
 *
 * `packages/db/src/__tests__/parity.test.ts` fails if a Drizzle column and a
 * model field drift apart on either side.
 */
export * from "./admin";
export * from "./auth";
export * from "./billing";
export * from "./enums";
export * from "./ids";
export * from "./posts";
export * from "./settings";
