---
name: testing
description: Write and run unit tests, API tests, Workers tests, and E2E Playwright tests against a spec
---

# Testing Skill

Comprehensive testing workflow: unit tests (Vitest), API tests (Vitest + the `HttpApi` in-process over an in-memory SQLite), Workers tests (Miniflare D1), and E2E functional tests (Playwright) written against a specification. If no spec exists, prompt the user to provide one before writing tests.

## Testing Pyramid

```
         /  E2E  \        ← Playwright: full user flows against a local D1
        /  API    \       ← Vitest + makeTestApi: every endpoint end to end
       /  Workers  \      ← Vitest pool-workers: migrations and D1 behavior
      /   Unit      \     ← Vitest: schemas, pure logic, utils
```

**Rule: every feature ships with tests at the unit, API, and E2E levels.**

## Prerequisite: Specification

Before writing any test, you MUST have a clear specification. If the user has not provided one:

1. **Ask** for the feature requirements (see `spec-driven-development` skill)
2. **Document** acceptance criteria as a checklist
3. **Map** each criterion to a test case
4. **Get approval** before writing test code

### Spec → Test Mapping Example

```
Spec: "Users can create posts with a title (required, max 256 chars) and content (required)"

Unit tests:
  ✓ CreatePost rejects empty title
  ✓ CreatePost rejects title > 256 chars
  ✓ CreatePost rejects missing content
  ✓ CreatePost accepts valid input

API tests:
  ✓ posts.create inserts a row and returns 201 with the post
  ✓ posts.create is Unauthorized without a credential
  ✓ posts.create is Forbidden{scope} with a read-only key
  ✓ posts.list returns created posts

E2E tests:
  ✓ Authenticated user can create a post from the form
  ✓ Post appears in the list after creation
  ✓ Form shows validation error for empty title
```

## Unit Tests (Vitest)

### Where to Put Them

```
packages/
├── domain/src/__tests__/api.test.ts          # contract invariants (HttpApi.reflect)
├── domain/src/__tests__/models.test.ts       # Schema validation
├── db/src/__tests__/database.test.ts         # Database service on sqlite-node
├── api-client/src/__tests__/                 # client + query layer
├── settings/src/__tests__/schemas.test.ts
└── create-gmacko-app/src/__tests__/types.test.ts
```

### Running

```bash
pnpm test                          # All unit + API tests
pnpm -F @gmacko/api test           # API package only
pnpm -F @gmacko/api test:watch     # Watch mode
pnpm test:workers                  # Miniflare D1 suites
pnpm test:coverage                 # With coverage report
```

### Patterns

#### Testing domain Schemas

```typescript
// packages/domain/src/__tests__/models.test.ts
import { Schema } from "effect";
import { describe, expect, it } from "vitest";

import { CreatePost } from "../posts";

const decode = Schema.decodeUnknownSync(CreatePost);

describe("CreatePost", () => {
  it("accepts valid input", () => {
    expect(decode({ title: "Hello", content: "World" })).toMatchObject({ title: "Hello" });
  });

  it("rejects an empty title", () => {
    expect(() => decode({ title: "", content: "x" })).toThrow();
  });

  it("rejects a title exceeding max length", () => {
    expect(() => decode({ title: "a".repeat(257), content: "x" })).toThrow();
  });
});
```

#### Testing Utility Functions

```typescript
// packages/auth/src/__tests__/api-keys.test.ts
import { Effect } from "effect";
import { describe, expect, it } from "vitest";

import { hashSecret, KEY_PREFIX } from "../api-keys";

describe("API key hashing", () => {
  it("is deterministic", async () => {
    const a = await Effect.runPromise(hashSecret(`${KEY_PREFIX}test`));
    const b = await Effect.runPromise(hashSecret(`${KEY_PREFIX}test`));
    expect(a).toBe(b);
  });

  it("differs per secret", async () => {
    const a = await Effect.runPromise(hashSecret(`${KEY_PREFIX}a`));
    const b = await Effect.runPromise(hashSecret(`${KEY_PREFIX}b`));
    expect(a).not.toBe(b);
  });
});
```

## API Tests (Vitest + the HttpApi in-process)

API tests exercise the real handler chain (middleware, credential, rate limit, service, database) through the typed client, against an in-memory SQLite that has the checked-in migrations applied. No server, no network.

### Setup

`packages/api/src/testing.ts` provides `makeTestApi`:

```typescript
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { Effect } from "effect";
import { Database } from "@gmacko/db";
import { Post as PostTable } from "@gmacko/db/schema";
import { CreatePost } from "@gmacko/domain";
import { makeTestApi, type TestApi, type TestUser } from "../testing";

let api: TestApi;
let author: TestUser;

beforeAll(async () => {
  api = makeTestApi();                 // in-memory sqlite-node, migrations applied
  author = await api.createUser();     // signed-in user with a session cookie
});
afterAll(() => api.dispose());

const clearPosts = () =>
  api.run(Effect.flatMap(Database, ({ db }) => db.delete(PostTable)));
```

`TestApi` gives you `call` (typed client, resolves the success), `failure` (resolves the typed error), `fetch` (raw HTTP against the handler), `run` (an Effect against the app's services), `createUser`, `createApiKey`, and span/log inspection (`spansNamed`, `logsMentioning`).

### Testing Endpoints

```typescript
// packages/api/src/posts/posts.test.ts
describe("posts", () => {
  it("create returns the created row with 201 and needs the write scope", async () => {
    const created = await api.call(
      (client) => client.posts.create({ payload: new CreatePost({ title: "Hello", content: "World" }) }),
      { cookie: author.cookie },
    );
    expect(created).toMatchObject({ title: "Hello", content: "World" });

    const anonymous = await api.failure((client) =>
      client.posts.create({ payload: new CreatePost({ title: "x", content: "y" }) }),
    );
    expect(anonymous).toMatchObject({ _tag: "Unauthorized" });

    const readKey = await api.createApiKey(author, ["read"]);
    const scoped = await api.failure(
      (client) => client.posts.create({ payload: new CreatePost({ title: "x", content: "y" }) }),
      { bearer: readKey.key },
    );
    expect(scoped).toMatchObject({ _tag: "Forbidden", reason: "scope" });
  });

  it("rejects an empty title with 400", async () => {
    const response = await api.fetch("/api/posts", {
      method: "POST",
      headers: { "content-type": "application/json", cookie: author.cookie, origin: api.baseUrl },
      body: JSON.stringify({ title: "", content: "x" }),
    });
    expect(response.status).toBe(400);
  });
});
```

Test every endpoint for: the success shape and status, each declared error, `Unauthorized` without a credential, `Forbidden{scope}` with an under-scoped key, and (for admin endpoints) `Forbidden{role}` for a non-admin session.

### Testing services directly

When a service has logic worth testing without HTTP, run it against the app's services:

```typescript
const posts = await api.run(Effect.flatMap(Posts, (service) => service.list));
```

## Workers Tests (Miniflare D1)

`*.workers.test.ts` files run under `@cloudflare/vitest-pool-workers` on a real D1 (`vitest.workers.config.ts` in `packages/db` and `packages/api`). Use them for anything D1-specific: the migration set applied from empty (`packages/db/src/__tests__/migrations.workers.test.ts` asserts no `__new_` table survives), `Database.batch` atomicity, and error classification. `pnpm test:workers` runs them; a migration that passes on sqlite-node and fails here is a D1 rule violation.

## E2E Tests (Playwright)

E2E tests are written against the feature specification and test real user flows in the browser, against `vite dev` on workerd with its own local D1 (`apps/web/.wrangler/e2e`) and an emulated GitHub for OAuth.

### Directory Structure

```
apps/web/e2e/
├── global-setup.ts        # migrates + seeds the E2E D1, starts emulated GitHub
├── global-teardown.ts
├── helpers/
│   ├── db.ts              # reset(), migrate(), seed(), magicLinkToken(email), setUserRole(...)
│   ├── env.ts             # bindings for the dev server
│   ├── auth.ts            # signIn(page, person), signInAsAdmin, completeBootstrap, alice/bob
│   └── nav.ts             # navigation helpers
├── auth.spec.ts
├── api-keys.spec.ts
├── admin.spec.ts
├── invites.spec.ts
├── delete-account.spec.ts
├── session-expiry.spec.ts
├── ssr.spec.ts
└── headers.spec.ts
```

### Authentication

Sign-in runs through the real magic-link flow with `BYPASS_MAGIC_LINK=true`: a spec requests a link through the UI, reads the token back from the E2E database (`magicLinkToken(email)` in `helpers/db.ts` queries the `verification` table), and visits the link. `helpers/auth.ts` wraps that as `signIn(page, person)` (with `alice` and `bob` as seeded `Person`s) and `signInAsAdmin`; `setUserRole(email, "admin")` in `helpers/db.ts` promotes a user for admin specs.

```typescript
// shape of the flow the helpers implement
await page.goto("/");
await page.getByLabel("Email").fill(email);
await page.getByRole("button", { name: "Send magic link" }).click();
await page.goto(`/api/auth/magic-link/verify?token=${magicLinkToken(email)}`);
```

### Writing E2E Tests Against a Spec

```typescript
// apps/web/e2e/api-keys.spec.ts
import { expect, test } from "@playwright/test";
import { reset } from "./helpers/db";
import { signIn } from "./helpers/auth";

test.describe("API keys", () => {
  test.beforeEach(async ({ page }) => {
    reset();
    await signIn(page, { email: "keys@example.com", name: "Keys" });
  });

  /**
   * SPEC: User can create and revoke API keys
   * Acceptance:
   *   - Key is displayed once after creation
   *   - Key appears in the list
   *   - Revoked key disappears from list
   */
  test("user can create and revoke API keys", async ({ page }) => {
    await page.goto("/settings");
    await page.getByRole("button", { name: "Create key" }).click();
    await page.getByLabel("Name").fill("E2E Test Key");
    await page.getByLabel("read").check();
    await page.getByRole("button", { name: "Create" }).click();

    const keyText = await page.locator("code").first().textContent();
    expect(keyText).toMatch(/^gmk_/);

    await page.getByRole("button", { name: "Done" }).click();
    await expect(page.getByText("E2E Test Key")).toBeVisible();

    await page.getByRole("button", { name: "Revoke" }).click();
    await expect(page.getByText("E2E Test Key")).not.toBeVisible();
  });
});
```

In development only, an `x-test-delay: <ms>` request header holds an API response so a spec can leave a page while a mutation is in flight.

### Running E2E Tests

```bash
# Run all E2E tests
pnpm e2e:web                      # = pnpm -F @gmacko/web e2e

# Run specific test file
pnpm -F @gmacko/web e2e -- api-keys.spec.ts

# UI mode (interactive debugging) / headed
pnpm -F @gmacko/web e2e:ui
pnpm -F @gmacko/web e2e:headed

# View test report
pnpm -F @gmacko/web exec playwright show-report
```

Mobile E2E uses Maestro: `pnpm -F @gmacko/expo e2e` (`apps/expo/.maestro/`).

## Test Writing Guidelines

### Naming Convention

```typescript
// Unit tests: describe what the unit does
describe("CreatePost", () => {
  it("accepts valid input", ...);
  it("rejects an empty title", ...);
});

// API tests: describe the behavior per endpoint
describe("posts", () => {
  it("create returns the created row with 201 and needs the write scope", ...);
  it("remove is 404 for an unknown id", ...);
});

// E2E tests: describe the user story with spec reference
test("user can create a post from the form", ...);
test("post appears in the list after creation", ...);
```

### Coverage Targets

| Layer | Target | Enforced |
|-------|--------|----------|
| Unit (schemas, utils) | 90%+ | Yes |
| API (endpoints) | every endpoint, every declared error | Yes (contract test checks the declarations; API tests check behavior) |
| E2E (critical paths) | All acceptance criteria | Manual |

### What to Test at Each Level

| Level | Test | Don't Test |
|-------|------|------------|
| Unit | Schema validation, pure functions, transformations | Database queries, HTTP, UI rendering |
| API | Endpoint behavior, credential and role refusals, rate limits, database effects | Browser behavior, visual layout |
| Workers | D1-only behavior: migrations, batch atomicity, error mapping | Business logic already covered by API tests |
| E2E | User flows, page navigation, form submissions, SSR + hydration | Internal implementation, edge cases covered by unit tests |

## Prompting for Missing Specs

If a user asks you to test a feature but hasn't provided a spec, ask these questions:

1. **What is the feature?** (one sentence)
2. **Who uses it?** (anonymous, authenticated user, admin, API key with which scope)
3. **What are the success criteria?** (list of behaviors)
4. **What are the error cases?** (invalid input, unauthorized, forbidden, not found, conflict)
5. **Are there edge cases?** (empty lists, max lengths, concurrent access)

Then create a test plan document before writing any test code:

```markdown
## Test Plan: [Feature Name]

### Acceptance Criteria
- [ ] Criterion 1 → `unit: test_name` + `e2e: test_name`
- [ ] Criterion 2 → `api: test_name`

### Error Cases
- [ ] Invalid input → `unit: schema_rejects_invalid`
- [ ] Unauthorized → `api: requires_credential`

### Edge Cases
- [ ] Empty list → `e2e: shows_empty_state`
```
