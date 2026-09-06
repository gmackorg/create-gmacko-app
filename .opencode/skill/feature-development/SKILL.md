---
name: feature-development
description: Implement full-stack features with database, API, web UI, and mobile UI
---

# Feature Development Skill

Use this skill when implementing full-stack features in the create-gmacko-app template. This is the **orchestration skill** — it coordinates the specialized skills for a complete workflow.

## Related Skills

| Skill | When to Use |
|-------|-------------|
| **spec-driven-development** | Before coding — gather requirements and write acceptance criteria |
| **api-first-development** | Building the contract, services, handlers, and query layer |
| **performance** | Adding loader prefetching, Suspense, optimistic updates, and polish |
| **testing** | Writing unit, API, and E2E tests against the spec |
| **saas-compliance** | Adding audit logging, security headers, and SOC2 controls |
| **frontend-development** | Building UI with shadcn/ui and NativeWind |

## Complete Workflow

### Phase 1: Specification (→ spec-driven-development)

**Never start coding without a clear spec.** If the user's request is vague:

1. Ask clarifying questions (data model, permissions, platforms, edge cases)
2. Write a structured specification with acceptance criteria
3. Get user approval before proceeding

```
User says: "Add a comments feature"
You respond: Ask 5-7 clarifying questions, then write the spec
```

### Phase 2: Data Model

If your feature needs new data, add a D1 (SQLite) table with the shared column helpers:

```typescript
// packages/db/src/schema.ts
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import { id, timestamps } from "./columns";

export const yourTable = sqliteTable("your_table", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text().notNull(),
  status: text().notNull().default("active"),
  ...timestamps(),
});
```

Declare the models the contract will expose:

```typescript
// packages/domain/src/your-feature/models.ts
import { Schema } from "effect";
import { boundedString, id, stringBetween } from "../primitives";

export const YourFeatureId = id("YourFeatureId");
export type YourFeatureId = typeof YourFeatureId.Type;

export class YourFeature extends Schema.Class<YourFeature>("YourFeature")({
  id: YourFeatureId,
  title: Schema.String,
  status: Schema.Literals(["active", "archived"]),
  createdAt: Schema.Date,
}) {}

export class CreateYourFeature extends Schema.Class<CreateYourFeature>("CreateYourFeature")({
  title: stringBetween(1, 256),
  description: Schema.optional(boundedString(2000)),
}) {}

export const CreateYourFeatureForm = Schema.toStandardSchemaV1(CreateYourFeature);
```

After schema changes:

```bash
pnpm db:generate       # drizzle-kit generate + flatten into packages/db/migrations
pnpm db:migrate:local  # apply to the local D1 (wrangler d1 migrations apply --local)
pnpm -F @gmacko/db test:workers   # the migration set on a real (Miniflare) D1
```

Review the generated SQL before applying it: D1 migrations must be
expand/contract only (no `__new_` table rebuilds); see `docs/drizzle-migrations.md`.

### Phase 3: API Layer (→ api-first-development)

Build the API first. The `HttpApi` contract in `packages/domain` is the single source of truth consumed by web, mobile, and the operator tools.

```typescript
// packages/domain/src/your-feature/api.ts
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { SessionOrKey } from "../security";
import { CreateYourFeature, YourFeature } from "./models";

export class YourFeatureApi extends HttpApiGroup.make("yourFeature")
  .add(HttpApiEndpoint.get("list", "/", { success: Schema.Array(YourFeature) }))
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: CreateYourFeature,
      success: YourFeature.pipe(HttpApiSchema.status(201)),
    }).middleware(SessionOrKey("write")),
  )
  .prefix("/your-features") {}
```

Add the group to `AppApi`:

```typescript
// packages/domain/src/api.ts
export class AppApi extends HttpApi.make("gmacko")
  // ... existing groups
  .add(YourFeatureApi)
  .prefix("/api") {}
```

Implement it:

```typescript
// packages/api/src/your-feature/handlers.ts
import { AppApi } from "@gmacko/domain";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { internal, withUser } from "../boundary";
import { YourFeatures } from "./service";

export const YourFeatureHandlers = HttpApiBuilder.group(AppApi, "yourFeature", (handlers) =>
  Effect.map(YourFeatures, (features) =>
    handlers
      .handle("list", () => internal(features.list))
      .handle("create", ({ payload }) => withUser((user) => features.create(user.id, payload))),
  ),
).pipe(Layer.provide(YourFeatures.layer));
```

Register the handler layer in `packages/api/src/layer.ts`, add the query layer in `packages/api-client/src/queries/`, and regenerate `docs/API_AUTH.md` (`pnpm -F @gmacko/domain docs:api-auth`).

### Phase 4: Web UI (→ performance, → frontend-development)

Every route MUST prefetch in its loader (in-process on the server, no network hop) and read with `useSuspenseQuery`:

```typescript
// apps/web/src/routes/your-feature.tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "~/lib/api";
import { CreateForm } from "~/components/your-feature/create-form";

export const Route = createFileRoute("/your-feature")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(queries.yourFeature.list());
  },
  component: YourFeaturePage,
});

function YourFeaturePage() {
  const { data: items } = useSuspenseQuery(queries.yourFeature.list());

  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Your Feature</h1>
      <CreateForm />
      {items.length === 0 ? (
        <EmptyState message="No items yet. Create your first one!" />
      ) : (
        <div className="space-y-4">
          {items.map((item) => (
            <YourFeatureCard key={item.id} item={item} />
          ))}
        </div>
      )}
    </div>
  );
}
```

Mutations invalidate through the meta the query layer attaches; nothing in the app spells a query key:

```typescript
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { CreateYourFeatureForm } from "@gmacko/domain/your-feature";
import { Button } from "@gmacko/ui/button";
import { Input } from "@gmacko/ui/input";
import { mutations } from "~/lib/api";

export function CreateForm() {
  const create = useMutation(mutations.yourFeature.create());
  const form = useForm({
    defaultValues: { title: "" },
    validators: { onSubmit: CreateYourFeatureForm },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(value);
      form.reset();
    },
  });

  return (
    <form onSubmit={(e) => { e.preventDefault(); void form.handleSubmit(); }}>
      <form.Field name="title">
        {(field) => (
          <Input
            value={field.state.value}
            onChange={(e) => field.handleChange(e.target.value)}
            placeholder="Title"
          />
        )}
      </form.Field>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Creating..." : "Create"}
      </Button>
    </form>
  );
}
```

### Phase 5: Mobile UI (→ frontend-development)

Build the same feature for Expo with NativeWind. The API layer and the query layer are shared — only the UI changes.

```typescript
// apps/expo/src/app/your-feature/index.tsx
import { useQuery } from "@tanstack/react-query";
import { View, Text, FlatList } from "react-native";
import { queries } from "~/utils/api";
import { CreateForm } from "./_components/create-form";

export default function YourFeatureScreen() {
  const { data: items, isLoading, refetch } = useQuery(queries.yourFeature.list());

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-muted-foreground">Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 p-4">
      <Text className="text-2xl font-bold mb-6 text-foreground">Your Feature</Text>
      <CreateForm />
      <FlatList
        data={items}
        renderItem={({ item }) => (
          <View className="p-4 bg-card rounded-lg mb-2 border border-border">
            <Text className="text-foreground">{item.title}</Text>
          </View>
        )}
        keyExtractor={(item) => item.id}
        onRefresh={refetch}
        refreshing={isLoading}
        removeClippedSubviews
        maxToRenderPerBatch={10}
        windowSize={5}
      />
    </View>
  );
}
```

### Phase 6: Observability

The endpoint span, request id, and 500 boundary are automatic (`EndpointBoundary`). Add product analytics and error tracking at the client:

```typescript
// In your mutation's onSuccess:
import { trackEvent } from "@gmacko/analytics/web";

onSuccess: (data) => {
  trackEvent("your_feature_created", {
    id: data.id,
    title: data.title,
  });
},
```

### Phase 7: Testing (→ testing)

Write tests at every level against the spec's acceptance criteria:

| Test Type | Location | What to Test |
|-----------|----------|--------------|
| **Unit** | `packages/domain/src/__tests__/` | Schema validation, edge cases |
| **API** | `packages/api/src/<group>/<group>.test.ts` | Endpoints through `makeTestApi` (in-memory SQLite) |
| **Workers** | `packages/{db,api}/src/**/*.workers.test.ts` | Migrations and D1-specific behavior on Miniflare |
| **E2E** | `apps/web/e2e/` | Full user flows in Playwright against a local D1 |

```bash
pnpm test              # Unit + API tests
pnpm test:workers      # Miniflare D1 suites
pnpm e2e:web           # Playwright E2E tests
pnpm check:fast        # lint + typecheck + standards
```

### Phase 8: Compliance (→ saas-compliance)

For features that handle user data or sensitive operations:

- Verify the credential and role checks declared in the contract match the spec
- Check data retention/deletion compliance (cascades from `user`)
- Add audit logging for mutations where the SaaS layers include it

## Feature Development Checklist

Before marking a feature as complete, verify all of these:

### Spec & Requirements
- [ ] Clear specification with acceptance criteria exists
- [ ] All edge cases identified and handled
- [ ] Permissions model defined and enforced

### Data & API
- [ ] Database schema uses `sqliteTable` with the `columns.ts` helpers; migration reviewed (expand/contract)
- [ ] Models and endpoints in `@gmacko/domain`; every endpoint declares its credential
- [ ] Service + handlers in `@gmacko/api`, registered in `ApiLive`
- [ ] Query layer entries in `@gmacko/api-client/queries` (keys, options, invalidation)
- [ ] `docs/API_AUTH.md` regenerated
- [ ] No `db.transaction`; multi-statement writes use `Database.batch`, read-check-write uses a guarded `updateWhere`

### Web UI
- [ ] Loader prefetching with `ensureQueryData`
- [ ] Suspense boundaries with skeleton fallbacks
- [ ] Optimistic updates for mutations where they help
- [ ] Empty states and error states
- [ ] Works in light and dark mode
- [ ] Responsive on mobile viewports

### Mobile UI
- [ ] Same feature available in Expo app (unless web-only)
- [ ] FlatList with performance optimizations
- [ ] Pull-to-refresh where appropriate
- [ ] NativeWind classes use semantic tokens (text-foreground, bg-card, etc.)

### Observability
- [ ] PostHog events tracked for key actions
- [ ] Sentry breadcrumbs on mutations
- [ ] Error boundaries around async components

### Testing
- [ ] Unit tests for schemas and business logic
- [ ] API tests for every endpoint (success, each declared error, credential refusals)
- [ ] E2E tests for critical user flows
- [ ] All acceptance criteria have corresponding tests

### Quality
- [ ] `pnpm check:fast` passes (lint, typecheck, standards)
- [ ] `pnpm test` and `pnpm test:workers` pass
- [ ] `pnpm e2e:web` passes (if E2E tests exist)

## Integration Patterns

### If feature is optional (integration)

1. Add flag to `packages/config/src/integrations.ts`:

```typescript
export const integrations = {
  // ... existing
  yourFeature: false,
} as const;
```

2. Check flag before initializing:

```typescript
import { integrations } from "@gmacko/config";

if (integrations.yourFeature) {
  // Initialize feature
}
```

3. Add bindings to `AppConfig.fromBindings` (server) or `apps/web/src/env.ts` (browser), and document them in `.env.example`

### If feature needs external service

1. Create wrapper package in `packages/your-service/`
2. Follow existing packages for pattern (analytics, monitoring, payments)
3. Export a unified interface that handles the disabled state
4. Keep it Worker-safe if `apps/web` will depend on it: no `process.env`, no `node:` imports, `fetch`-based HTTP
