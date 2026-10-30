---
"create-gmacko-app": minor
"@gmacko/api-client": minor
"@gmacko/api-cli": minor
"@gmacko/mcp-server": minor
---

Breaking: API-key permissions are a `resource:action` scope catalog instead of `read` / `write` / `delete` / `admin`.

- `packages/domain/src/scopes.ts` is the one vocabulary: `posts:write`, `posts:delete`, `workspace:read`, `workspace:invite`, `workspace:join`, `billing:read`, `preferences:read`, `preferences:write`, `profile:read`, `api_keys:read`, `api_keys:manage`, `platform:admin`. Each scope says whether an OAuth client may ever be granted it; `workspace:join`, `api_keys:manage` and `platform:admin` are key-only.
- The contract middleware `SessionOrKey(scope)` is now `RequireScope(scope)`, and every bearer endpoint names exactly one catalog scope (`scopes.test.ts` fails on an endpoint without one or a scope no endpoint uses). A scope implies no other; a session holds them all. `docs/API_AUTH.md` lists the catalog.
- Migration `api_key_scopes` rewrites stored keys so each keeps its effective access: `read` becomes every `:read` scope, `write` `posts:write` + `preferences:write` + `workspace:invite` + `workspace:join`, `delete` `posts:delete`, and `admin` (which implied everything) every scope. Values outside the catalog grant nothing.
- The key form (web and Expo) picks scopes with the new `@gmacko/ui/scope-picker`, the read scopes preselected. `create_api_key --permissions` takes catalog scopes, and each operator tool's description names its scope.
- better-auth is 1.7.14. Migration `auth_1_7_14_drop_issuer` drops the `account.issuer` column 1.7.0–1.7.2 added (index first, no table rebuild).
