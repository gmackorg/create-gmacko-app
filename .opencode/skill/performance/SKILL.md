---
name: performance
description: Preloading, prefetching, caching, and polish patterns for a production-quality app
---

# Performance & Polish Skill

Build polished, production-quality features with proper preloading, caching, optimistic updates, and responsive design. Every page should feel instant.

## Core Principles

1. **Prefetch everything** — data should be ready before the user needs it
2. **Show something immediately** — use skeletons and Suspense boundaries
3. **Optimistic updates** — update the UI before the server confirms
4. **Cache aggressively** — minimize redundant network requests
5. **Measure, don't guess** — use PostHog, Web Vitals, and the OTLP endpoint spans to verify

## Server-Side Prefetching (TanStack Start)

### Route-Level Prefetch

Every route that displays API data MUST prefetch in its loader. On the server the loader calls the API in-process (no network hop, one `RequestContext` per render); the query cache is dehydrated into the HTML and hydrated in the browser:

```typescript
// apps/web/src/routes/features.tsx
import { useSuspenseQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { queries } from "~/lib/api";

export const Route = createFileRoute("/features")({
  loader: async ({ context: { queryClient } }) => {
    // Block on what the first paint needs
    await queryClient.ensureQueryData(queries.feature.list());
  },
  component: FeaturesPage,
});

function FeaturesPage() {
  const { data } = useSuspenseQuery(queries.feature.list());
  return <FeatureList features={data} />;
}
```

### Detail Route Prefetch

```typescript
// apps/web/src/routes/features.$id.tsx
export const Route = createFileRoute("/features/$id")({
  loader: async ({ context: { queryClient }, params }) => {
    await queryClient.ensureQueryData(queries.feature.byId(params.id));
  },
  component: FeatureDetail,
});
```

### Blocking vs. streaming

`ensureQueryData` blocks the loader for data the page cannot render without; `prefetchQuery` starts the request without blocking so a lower section can stream in under a Suspense boundary:

```typescript
loader: async ({ context: { queryClient } }) => {
  await Promise.all([
    queryClient.ensureQueryData(queries.auth.session()),
    queryClient.ensureQueryData(queries.settings.launchState()),
  ]);
  void queryClient.prefetchQuery(queries.posts.list());
},
```

### Prefetching on Navigation

`<Link preload="intent">` runs the target route's loader on hover/focus, so its `ensureQueryData` fills the cache before the click.

## Suspense Boundaries & Skeletons

### Page-Level Suspense

Wrap every async data component in a Suspense boundary with a skeleton:

```typescript
<Suspense fallback={<FeatureListSkeleton />}>
  <FeatureList />
</Suspense>
```

### Skeleton Components

Create meaningful skeletons that match the layout of loaded content:

```typescript
export function FeatureListSkeleton() {
  return (
    <div className="space-y-4">
      {Array.from({ length: 3 }).map((_, i) => (
        <div key={i} className="animate-pulse rounded-lg border p-4">
          <div className="bg-muted h-5 w-48 rounded" />
          <div className="bg-muted mt-2 h-4 w-full rounded" />
          <div className="bg-muted mt-1 h-4 w-2/3 rounded" />
        </div>
      ))}
    </div>
  );
}
```

### Independent Suspense Zones

Split pages into independent loading zones so fast queries don't wait for slow ones:

```typescript
function DashboardPage() {
  return (
    <>
      <div className="grid gap-6 md:grid-cols-2">
        <Suspense fallback={<StatsSkeleton />}>
          <StatsCards />   {/* useSuspenseQuery(queries.admin.stats()) */}
        </Suspense>
        <Suspense fallback={<RecentUsersSkeleton />}>
          <RecentUsers />  {/* useSuspenseQuery(queries.admin.listUsers()) */}
        </Suspense>
      </div>
      <Suspense fallback={<PostListSkeleton />}>
        <RecentPosts />    {/* useSuspenseQuery(queries.posts.list()) */}
      </Suspense>
    </>
  );
}
```

## Optimistic Updates

Update the UI immediately before the server responds. Keys come from `queryKeys` in `@gmacko/api-client/queries`; invalidation after settle is applied by the `QueryClient` from the mutation's meta, so only the optimistic part is written here:

```typescript
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@gmacko/api-client/queries";
import { mutations } from "~/lib/api";

export function CreateFeatureForm() {
  const queryClient = useQueryClient();

  const createMutation = useMutation({
    ...mutations.feature.create(),
    onMutate: async (newFeature) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.feature.list() });
      const previous = queryClient.getQueryData(queryKeys.feature.list());
      queryClient.setQueryData(queryKeys.feature.list(), (old) => [
        { id: "temp-" + Date.now(), ...newFeature, createdAt: new Date() },
        ...(old ?? []),
      ]);
      return { previous };
    },
    onError: (_err, _vars, context) => {
      if (context?.previous) {
        queryClient.setQueryData(queryKeys.feature.list(), context.previous);
      }
    },
  });

  // ...
}
```

## Image & Asset Optimization

Vite fingerprints and serves static assets from the Worker's assets binding. Use plain `<img>` with explicit `width`/`height` (no layout shift) and `loading="lazy"` below the fold; put `fetchpriority="high"` on the hero image. Cloudflare Images or a resizing origin can be added per app.

### Font Loading

Fonts are self-hosted through Vite (`apps/web/src/styles.css`) with `font-display: swap`; preload the primary face in `__root.tsx`'s `head`.

## Caching Strategy

### Query Stale Times

`queryOptions` from the query layer can be extended per use:

```typescript
// Static data (launch state, plans) — cache for 5 minutes
const { data: launch } = useQuery({
  ...queries.settings.launchState(),
  staleTime: 5 * 60 * 1000,
});

// User-specific data — cache for 1 minute
const { data: prefs } = useQuery({
  ...queries.settings.getPreferences(),
  staleTime: 60 * 1000,
});

// Frequently changing data — default stale time (refetch on mount)
const { data: posts } = useQuery(queries.posts.list());
```

### Invalidation

`invalidation` in `@gmacko/api-client/queries` maps every mutation to the queries it makes stale; `makeQueryClient` applies it on success. Add a new mutation's targets there rather than invalidating by hand in components.

### HTTP caching

Public GET endpoints can set `Cache-Control` from the handler; the Worker sits behind Cloudflare's cache for static assets automatically.

## Web Vitals Monitoring

Track Core Web Vitals with PostHog (add the `web-vitals` package to `apps/web`):

```typescript
// apps/web/src/client.tsx (browser only)
import { onCLS, onINP, onLCP } from "web-vitals";
import { trackEvent } from "@gmacko/analytics/web";

for (const on of [onCLS, onINP, onLCP]) {
  on((metric) => {
    trackEvent("web_vitals", {
      name: metric.name,
      value: metric.value,
      rating: metric.rating, // good, needs-improvement, poor
      delta: metric.delta,
    });
  });
}
```

Server-side latency is already recorded per endpoint (`http.server.duration`, one span per `group.endpoint`) when `OTEL_EXPORTER_OTLP_ENDPOINT` is set; `x-trace-id` on the response links a slow page to its trace.

## Mobile Performance (Expo)

### FlatList Optimization

```typescript
<FlatList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  // Performance optimizations
  removeClippedSubviews={true}
  maxToRenderPerBatch={10}
  windowSize={5}
  initialNumToRender={10}
  getItemLayout={(_, index) => ({
    length: ITEM_HEIGHT,
    offset: ITEM_HEIGHT * index,
    index,
  })}
/>
```

### Avoid Re-renders

```typescript
import { memo, useCallback } from "react";

// Memoize list items
const FeatureItem = memo(function FeatureItem({ item }: { item: Feature }) {
  return (
    <View className="rounded-lg border border-border bg-card p-4">
      <Text className="text-foreground font-semibold">{item.title}</Text>
    </View>
  );
});

// Memoize renderItem callback
const renderItem = useCallback(
  ({ item }: { item: Feature }) => <FeatureItem item={item} />,
  [],
);
```

## Polish Checklist

Before shipping any feature:

### Visual
- [ ] Loading skeletons match final layout
- [ ] Empty states have helpful messaging
- [ ] Error states offer retry actions
- [ ] Transitions are smooth (no layout shift)
- [ ] Works in both light and dark mode
- [ ] Responsive on mobile viewport sizes

### Performance
- [ ] Loader prefetching for all route data
- [ ] Suspense boundaries around async components
- [ ] Images have explicit dimensions and lazy-load below the fold
- [ ] No unnecessary client-side data fetching
- [ ] Optimistic updates for mutations
- [ ] Appropriate stale times on queries

### Accessibility
- [ ] Keyboard navigation works
- [ ] Focus management on route changes
- [ ] ARIA labels on icon-only buttons
- [ ] Color contrast meets WCAG AA
- [ ] Screen reader friendly

### SEO (public pages)
- [ ] `head` metadata on the route
- [ ] Semantic heading hierarchy (h1 → h2 → h3)
- [ ] Open Graph tags for social sharing
