--
-- A trimmed `pg_dump --data-only --column-inserts` of the pre-migration
-- Postgres database: the shapes the converter has to handle, one of each.
--   * uuid primary keys and foreign keys (text in D1)
--   * timestamptz and bare timestamp (epoch milliseconds in D1)
--   * boolean (0/1 in D1)
--   * jsonb (JSON text in D1)
--   * camelCase identifiers (snake_case columns in D1)
--   * a NULL, an embedded apostrophe, an E'' escape, a multi-line string
--   * a table and a column the D1 schema does not have (both skipped)
--   * rows out of dependency order (the converter emits parents first)
--
-- Used by src/__tests__/pg-to-d1.test.ts, which converts this and applies the
-- result to a real sqlite database with the D1 migrations on it.
--

SET statement_timeout = 0;

INSERT INTO public.workspace (id, name, slug, "ownerUserId", "createdAt", "updatedAt") VALUES ('3f1a6d9c-1c2b-4a55-9a1e-1b2c3d4e5f60', 'Ada''s workspace', 'adas-workspace', 'e0f1a2b3-c4d5-4e6f-8a9b-0c1d2e3f4a5b', '2026-01-02 03:04:05.678+00', NULL);

INSERT INTO public."user" (id, name, email, "emailVerified", image, role, "createdAt", "updatedAt") VALUES ('e0f1a2b3-c4d5-4e6f-8a9b-0c1d2e3f4a5b', 'Ada Lovelace', 'ada@example.com', true, NULL, 'admin', '2026-01-01 00:00:00+00', '2026-01-01 00:00:00+00');
INSERT INTO public."user" (id, name, email, "emailVerified", image, role, "createdAt", "updatedAt") VALUES ('9a8b7c6d-5e4f-4a3b-8c2d-1e0f9a8b7c6d', E'Grace\nHopper', 'grace@example.com', false, 'https://example.com/g.png', 'user', '2026-02-03 04:05:06+00', '2026-02-03 04:05:06+00');

INSERT INTO public.api_keys (id, "userId", name, "keyHash", "keyPrefix", permissions, "lastUsedAt", "expiresAt", "createdAt", "revokedAt") VALUES ('11111111-2222-4333-8444-555555555555', 'e0f1a2b3-c4d5-4e6f-8a9b-0c1d2e3f4a5b', 'deploy key', 'a1b2c3', 'gmk_deadbeef', '["read", "write"]', NULL, NULL, '2026-03-04 05:06:07+00', NULL);

INSERT INTO public.post (id, title, content, "createdAt", "updatedAt") VALUES ('aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee', 'Notes on the Analytical Engine', 'It can do
whatever we know how to order it to perform.', '2026-01-05 06:07:08.9+00', NULL);

INSERT INTO public.user_preferences (id, "userId", theme, language, timezone, "emailNotifications", "pushNotifications", "createdAt", "updatedAt", "legacyDigestHour") VALUES ('bbbbbbbb-cccc-4ddd-8eee-ffffffffffff', 'e0f1a2b3-c4d5-4e6f-8a9b-0c1d2e3f4a5b', 'dark', 'en', 'Europe/London', true, false, '2026-01-06 00:00:00', NULL, 7);

INSERT INTO public.legacy_audit_log (id, message) VALUES ('cccccccc-dddd-4eee-8fff-000000000000', 'no such table in D1');
