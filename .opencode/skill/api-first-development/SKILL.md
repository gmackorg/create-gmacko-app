---
name: api-first-development
description: Build APIs first, then implement web and mobile UIs with full platform parity
---

# API-First Development Skill

Build every feature API-first: schema → contract → service + handler → query layer → web UI → mobile UI. The `HttpApi` contract in `packages/domain` is the single typed surface; the browser, the SSR loader, Expo, and the operator tools all consume it through `@gmacko/api-client`, so type safety flows from the database to every client and feature parity across platforms is the default unless explicitly specified otherwise.

## Workflow

1. **Gather requirements** — clarify the spec before writing code (see `spec-driven-development` skill)
2. **Schema** — define the data model in Drizzle (`packages/db/src/schema.ts`, SQLite for D1)
3. **Contract** — add the `Schema` models and the `HttpApiGroup` in `packages/domain/src/<feature>/`
4. **Service + handlers** — implement the group in `packages/api/src/<feature>/`
5. **Query layer** — add `queryOptions`/`mutationOptions` and invalidation in `packages/api-client/src/queries/`
6. **Web UI** — TanStack Start route with loader prefetching and shadcn/ui
7. **Mobile UI** — Expo screen with the same `queries`/`mutations`
8. **Observability** — Sentry and PostHog at the client; the endpoint span comes for free
9. **Tests** — unit → API → E2E (see `testing` skill)

## Checklist

- [ ] Schema models and the endpoint group declared in `@gmacko/domain`; every endpoint names its credential
- [ ] Group added to `AppApi` (`packages/domain/src/api.ts`) and `docs/API_AUTH.md` regenerated (`pnpm -F @gmacko/domain docs:api-auth`)
- [ ] Service and `HttpApiBuilder.group` handlers in `@gmacko/api`, wired into `ApiLive`
- [ ] `queries`/`mutations` and invalidation entries in `@gmacko/api-client/queries`
- [ ] Web route built with loader prefetching
- [ ] Mobile screen built with the same queries
- [ ] Sentry breadcrumbs added for key mutations
- [ ] PostHog events tracked for key user actions
- [ ] Loading / error / empty states handled on both platforms
- [ ] API tests through `makeTestApi`
- [ ] Type-check and standards pass (`pnpm check:fast`)

## Step 1: Schema and Contract

The data model is a D1 (SQLite) table with explicit snake_case column names; use the helpers in `packages/db/src/columns.ts`:

```typescript
// packages/db/src/schema.ts
import { sqliteTable, text } from "drizzle-orm/sqlite-core";
import { user } from "./auth-schema";
import { id, timestamps } from "./columns";

export const feature = sqliteTable("feature", {
  id: id(),
  userId: text("user_id").notNull().references(() => user.id, { onDelete: "cascade" }),
  title: text().notNull(),
  description: text(),
  priority: text().notNull().default("medium"),
  ...timestamps(),
});
```

Then `pnpm db:generate`, review the SQL (expand/contract only, no `__new_` tables), `pnpm db:migrate:local`.

The contract declares the models and the endpoints once, for every client:

```typescript
// packages/domain/src/feature/models.ts
import { Schema } from "effect";
import { boundedString, id, stringBetween } from "../primitives";

export const FeatureId = id("FeatureId");
export type FeatureId = typeof FeatureId.Type;

export class Feature extends Schema.Class<Feature>("Feature")({
  id: FeatureId,
  title: Schema.String,
  description: Schema.NullOr(Schema.String),
  priority: Schema.Literals(["low", "medium", "high"]),
  createdAt: Schema.Date,
}) {}

export class CreateFeature extends Schema.Class<CreateFeature>("CreateFeature")({
  title: stringBetween(1, 256),
  description: Schema.optional(boundedString(2000)),
  priority: Schema.optional(Schema.Literals(["low", "medium", "high"])),
}) {}

/** Standard Schema view for TanStack Form validators. */
export const CreateFeatureForm = Schema.toStandardSchemaV1(CreateFeature);
```

```typescript
// packages/domain/src/feature/api.ts
import { Schema } from "effect";
import { HttpApiEndpoint, HttpApiGroup, HttpApiSchema } from "effect/unstable/httpapi";
import { NotFound } from "../errors";
import { SessionOrKey } from "../security";
import { CreateFeature, Feature, FeatureId } from "./models";

export class FeatureApi extends HttpApiGroup.make("feature")
  .add(HttpApiEndpoint.get("list", "/", { success: Schema.Array(Feature) }))
  .add(
    HttpApiEndpoint.get("byId", "/:id", {
      params: { id: FeatureId },
      success: Feature,
      error: NotFound,
    }),
  )
  .add(
    HttpApiEndpoint.post("create", "/", {
      payload: CreateFeature,
      success: Feature.pipe(HttpApiSchema.status(201)),
    }).middleware(SessionOrKey("write")),
  )
  .add(
    HttpApiEndpoint.delete("remove", "/:id", {
      params: { id: FeatureId },
      error: NotFound,
    }).middleware(SessionOrKey("delete")),
  )
  .prefix("/features") {}
```

Add the group to `AppApi` in `packages/domain/src/api.ts`. Rules of thumb: reads take `SessionOrKey("read")`, mutations `SessionOrKey("write")`, deletes `SessionOrKey("delete")`, admin endpoints `SessionOrKey("admin")` plus `AdminOnly` (declare the credential last so it runs outermost). Public endpoints declare nothing.

## Step 2: Service and Handlers (API First)

Build the complete API before touching any UI. The service is an Effect `Context.Service` over `Database`; the handler group maps the contract onto it:

```typescript
// packages/api/src/feature/service.ts
import { Database, type DatabaseError } from "@gmacko/db";
import { feature as FeatureTable } from "@gmacko/db/schema";
import { NotFound } from "@gmacko/domain/errors";
import { type CreateFeature, Feature, type FeatureId } from "@gmacko/domain/feature";
import { desc, eq } from "drizzle-orm";
import { Context, Effect, Layer } from "effect";

export interface FeatureShape {
  readonly list: Effect.Effect<ReadonlyArray<Feature>, DatabaseError>;
  readonly byId: (id: FeatureId) => Effect.Effect<Feature, NotFound | DatabaseError>;
  readonly create: (userId: string, input: CreateFeature) => Effect.Effect<Feature, DatabaseError>;
  readonly remove: (id: FeatureId) => Effect.Effect<void, NotFound | DatabaseError>;
}

export class Features extends Context.Service<Features, FeatureShape>()("@gmacko/api/Features") {
  static layer: Layer.Layer<Features, never, Database> = Layer.effect(Features)(
    Effect.map(Database, ({ db, first, updateWhere }) =>
      Features.of({
        list: db.select().from(FeatureTable).orderBy(desc(FeatureTable.createdAt)).limit(20)
          .pipe(Effect.map((rows) => rows.map(toFeature))),
        byId: (id) =>
          first(
            db.select().from(FeatureTable).where(eq(FeatureTable.id, id)).limit(1),
            () => new NotFound({ resource: "feature", id }),
          ).pipe(Effect.map(toFeature)),
        create: (userId, input) =>
          first(
            db.insert(FeatureTable).values({ userId, ...input }).returning(),
            () => new Error("feature insert returned no row"),
          ).pipe(Effect.orDie, Effect.map(toFeature)),
        remove: (id) =>
          updateWhere(db.delete(FeatureTable).where(eq(FeatureTable.id, id))).pipe(
            Effect.filterOrFail((n) => n > 0, () => new NotFound({ resource: "feature", id })),
            Effect.asVoid,
          ),
      }),
    ),
  );
}
```

```typescript
// packages/api/src/feature/handlers.ts
import { AppApi } from "@gmacko/domain";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";
import { internal, withUser } from "../boundary";
import { Features } from "./service";

export const FeatureHandlers = HttpApiBuilder.group(AppApi, "feature", (handlers) =>
  Effect.map(Features, (features) =>
    handlers
      .handle("list", () => internal(features.list))
      .handle("byId", ({ params }) => internal(features.byId(params.id)))
      .handle("create", ({ payload }) => withUser((user) => features.create(user.id, payload)))
      .handle("remove", ({ params }) => withUser(() => features.remove(params.id))),
  ),
).pipe(Layer.provide(Features.layer));
```

Register the handler layer in `packages/api/src/layer.ts` (`ApiLive`). Never use `db.transaction`: atomic multi-statement writes are `Database.batch([...])`, read-check-write is a guarded `Database.updateWhere` whose 0-row result becomes `Conflict`.

## Step 3: Query Layer

One place spells query keys and invalidation, so no client ever does:

```typescript
// packages/api-client/src/queries/feature.ts
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import type { ApiClient } from "../client";
import { invalidates } from "./invalidation";
import { queryKeys } from "./keys";

export const featureQueries = (api: ApiClient) => ({
  list: () =>
    queryOptions({
      queryKey: queryKeys.feature.list(),
      queryFn: () => api.run((client) => client.feature.list()),
    }),
  byId: (id: FeatureId) =>
    queryOptions({
      queryKey: queryKeys.feature.byId(id),
      queryFn: () => api.run((client) => client.feature.byId({ params: { id } })),
    }),
});

export type CreateFeatureInput = ConstructorParameters<typeof CreateFeature>[0];

export const featureMutations = (api: ApiClient) => ({
  create: () =>
    mutationOptions({
      mutationKey: [...queryKeys.feature.all, "create"],
      mutationFn: (input: CreateFeatureInput) =>
        api.run((client) => client.feature.create({ payload: new CreateFeature(input) })),
      meta: invalidates("feature.create"),
    }),
});
```

Add the keys to `keys.ts`, the invalidation targets to `invalidation.ts`, and the group to `makeQueries`/`makeMutations` in `queries/index.ts`. `makeQueryClient` applies the invalidation after every successful mutation.

## Step 4: Web Route with Loader Prefetching

Route loaders call the API in-process on the server (no network hop) and hydrate the client; components read the same options with `useSuspenseQuery`:

```typescript
// apps/web/src/routes/features.tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "~/lib/api";

export const Route = createFileRoute("/features")({
  loader: async ({ context: { queryClient } }) => {
    await queryClient.ensureQueryData(queries.feature.list());
  },
  component: FeaturesPage,
});

function FeaturesPage() {
  const { data: features } = useSuspenseQuery(queries.feature.list());
  return (
    <main className="container mx-auto max-w-4xl py-8">
      <h1 className="mb-6 text-3xl font-bold">Features</h1>
      <FeatureList features={features} />
    </main>
  );
}
```

### Mutations

```typescript
import { useMutation } from "@tanstack/react-query";
import { mutations } from "~/lib/api";

export function CreateFeatureForm() {
  const create = useMutation(mutations.feature.create());
  // create.mutate({ title, content })
  // invalidation is applied by the QueryClient from the mutation's meta
}
```

Typed errors (`Unauthorized`, `Forbidden`, `NotFound`, `Conflict`, `RateLimited`) arrive as instances; `apps/web/src/lib/errors.ts` turns them into user-facing text.

### Prefetching on Navigation

Use `<Link preload="intent">` from `@tanstack/react-router`; the target route's loader runs on hover, and `ensureQueryData` there fills the cache.

## Step 5: Mobile Screen (Feature Parity)

Mirror the web implementation with the same `queries`/`mutations` (`apps/expo/src/utils/api.ts`):

```typescript
// apps/expo/src/app/features/index.tsx
import { useQuery } from "@tanstack/react-query";
import { View, Text, FlatList, ActivityIndicator, Pressable } from "react-native";
import { Link } from "expo-router";
import { queries } from "~/utils/api";

export default function FeaturesScreen() {
  const { data, isLoading, isError, refetch } = useQuery(queries.feature.list());

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-destructive mb-4 text-center">Failed to load features</Text>
        <Pressable onPress={() => refetch()} className="rounded-md bg-primary px-4 py-2">
          <Text className="text-primary-foreground font-medium">Retry</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      contentContainerClassName="p-4 gap-2"
      renderItem={({ item }) => (
        <Link href={`/features/${item.id}`} asChild>
          <Pressable className="rounded-lg border border-border bg-card p-4">
            <Text className="text-foreground font-semibold">{item.title}</Text>
          </Pressable>
        </Link>
      )}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View className="items-center p-8">
          <Text className="text-muted-foreground">No features yet</Text>
        </View>
      }
    />
  );
}
```

## Step 6: Observability Integration

Every endpoint already gets one span (`feature.create`), the request id, and a 500 boundary from `EndpointBoundary`; `DatabaseError`s are logged with their reason. Add client-side signal where it helps:

```typescript
// Sentry breadcrumbs on important mutations (browser)
import * as Sentry from "@sentry/react";

const create = useMutation({
  ...mutations.feature.create(),
  onError: (error) => Sentry.captureException(error),
});
```

```typescript
// PostHog — track user behavior
import { useTrackEvent } from "@gmacko/analytics/web/hooks";

function FeatureCreateForm() {
  const trackEvent = useTrackEvent();
  const handleCreate = async (data: CreateFeature) => {
    await create.mutateAsync(data);
    trackEvent("feature_created", { priority: data.priority });
  };
}
```

## Platform Parity Checklist

When building any feature, ensure parity unless explicitly scoped to one platform:

| Aspect | Web (TanStack Start) | Mobile (Expo) |
|--------|----------------------|---------------|
| Data fetching | loader `ensureQueryData` + `useSuspenseQuery` | `useQuery` |
| Mutations | `useMutation(mutations.x.y())`; invalidation from meta | same |
| Loading state | Suspense skeleton under the loader-hydrated route | ActivityIndicator |
| Error state | route `errorComponent` / Alert | Text + Retry button |
| Empty state | Centered message | `ListEmptyComponent` |
| Navigation | `<Link>` from `@tanstack/react-router` | `<Link>` from expo-router |
| Forms | TanStack Form with the domain's `*Form` Standard Schema | same schema, NativeWind inputs |
| Theme | CSS variables (light/dark) | NativeWind dark: variant |
| Analytics | `useTrackEvent` | same PostHog SDK |
| Auth guard | `beforeLoad` redirect (`~/lib/guards.ts`) | Expo Router redirect |

## Anti-Patterns to Avoid

- **Never build UI before the API is tested** — the group should pass its `makeTestApi` suite in isolation
- **Never validate twice with different schemas** — the domain `Schema` is the validator on the server and (as a Standard Schema view) in forms
- **Never fetch data through a server function** — `createServerFn` is for cookies and redirects only (`apps/web/src/server/actions.ts`); data goes through the contract (`no-server-fn-for-data`)
- **Never spell a query key in an app** — keys and invalidation live in `@gmacko/api-client/queries`
- **Never use `db.transaction`** — `Database.batch` or a guarded `updateWhere`
- **Never build for one platform only** — unless the requirement explicitly says so
- **Never hardcode strings** — use the `@gmacko/i18n` package if i18n is enabled
