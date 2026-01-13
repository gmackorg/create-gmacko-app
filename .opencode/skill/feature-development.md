# Feature Development Skill

Use this skill when implementing full-stack features in the create-gmacko-app template.

## Workflow Overview

This skill guides you through the complete feature development workflow:

1. Database schema changes
2. API layer (tRPC router)
3. Web UI (Next.js + shadcn/ui)
4. Mobile UI (Expo + NativeWind)
5. Testing and verification

## Checklist

- [ ] Define feature requirements and scope
- [ ] Add database schema changes if needed
- [ ] Create/update tRPC router procedures
- [ ] Build web UI components with shadcn/ui
- [ ] Build mobile UI components with NativeWind
- [ ] Add unit tests for business logic
- [ ] Verify type safety across packages

## Step 1: Database Schema

If your feature needs new data:

```typescript
// packages/db/src/schema.ts
import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

import { user } from "./auth-schema";

export const yourTable = pgTable("your_table", {
  id: uuid().primaryKey().defaultRandom(),
  userId: uuid()
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  title: text().notNull(),
  createdAt: timestamp().notNull().defaultNow(),
  updatedAt: timestamp()
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});
```

After schema changes:

```bash
pnpm db:push  # Apply schema to database
```

## Step 2: API Layer (tRPC)

Create router in `packages/api/src/router/`:

```typescript
// packages/api/src/router/your-feature.ts
import { z } from "zod/v4";

import { eq } from "@gmacko/db";
import { yourTable } from "@gmacko/db/schema";

import { createTRPCRouter, protectedProcedure, publicProcedure } from "../trpc";

export const yourFeatureRouter = createTRPCRouter({
  // Public query
  all: publicProcedure.query(async ({ ctx }) => {
    return ctx.db.select().from(yourTable);
  }),

  // Protected mutation
  create: protectedProcedure
    .input(z.object({ title: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      return ctx.db.insert(yourTable).values({
        userId: ctx.session.user.id,
        title: input.title,
      });
    }),

  // With API key auth
  byId: apiKeyReadProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      return ctx.db
        .select()
        .from(yourTable)
        .where(eq(yourTable.id, input.id))
        .limit(1);
    }),
});
```

Add to root router:

```typescript
// packages/api/src/root.ts
import { yourFeatureRouter } from "./router/your-feature";

export const appRouter = createTRPCRouter({
  // ... existing routers
  yourFeature: yourFeatureRouter,
});
```

## Step 3: Web UI (Next.js + shadcn/ui)

Create page and components:

```typescript
// apps/nextjs/src/app/your-feature/page.tsx
import { api } from "~/trpc/server";
import { YourFeatureList } from "./_components/list";
import { CreateForm } from "./_components/create-form";

export default async function YourFeaturePage() {
  const items = await api.yourFeature.all();

  return (
    <div className="container py-8">
      <h1 className="text-2xl font-bold mb-6">Your Feature</h1>
      <CreateForm />
      <YourFeatureList items={items} />
    </div>
  );
}
```

Use shadcn/ui components:

```bash
pnpm ui-add button card dialog form input
```

```typescript
// apps/nextjs/src/app/your-feature/_components/create-form.tsx
"use client";

import { Button } from "@gmacko/ui/button";
import { Input } from "@gmacko/ui/input";
import { api } from "~/trpc/react";

export function CreateForm() {
  const utils = api.useUtils();
  const create = api.yourFeature.create.useMutation({
    onSuccess: () => {
      utils.yourFeature.all.invalidate();
    },
  });

  return (
    <form onSubmit={(e) => {
      e.preventDefault();
      const formData = new FormData(e.currentTarget);
      create.mutate({ title: formData.get("title") as string });
    }}>
      <Input name="title" placeholder="Title" required />
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Creating..." : "Create"}
      </Button>
    </form>
  );
}
```

## Step 4: Mobile UI (Expo + NativeWind)

Create screen and components:

```typescript
// apps/expo/src/app/your-feature/index.tsx
import { View, Text, FlatList } from "react-native";
import { api } from "~/utils/api";
import { CreateForm } from "./_components/create-form";

export default function YourFeatureScreen() {
  const { data: items, isLoading } = api.yourFeature.all.useQuery();

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <Text>Loading...</Text>
      </View>
    );
  }

  return (
    <View className="flex-1 p-4">
      <Text className="text-2xl font-bold mb-6">Your Feature</Text>
      <CreateForm />
      <FlatList
        data={items}
        renderItem={({ item }) => (
          <View className="p-4 bg-card rounded-lg mb-2">
            <Text className="text-foreground">{item.title}</Text>
          </View>
        )}
        keyExtractor={(item) => item.id}
      />
    </View>
  );
}
```

## Step 5: Testing

Add unit tests for business logic:

```typescript
// packages/api/src/router/__tests__/your-feature.test.ts
import { describe, expect, it } from "vitest";

// Test your router procedures
```

Run tests:

```bash
pnpm test
pnpm typecheck
```

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

3. Add env vars to `.env.example` if needed

### If feature needs external service

1. Create wrapper package in `packages/your-service/`
2. Follow existing packages for pattern (analytics, monitoring, etc.)
3. Export unified interface that handles disabled state

## Common Patterns

### Optimistic updates

```typescript
const utils = api.useUtils();
const mutation = api.yourFeature.create.useMutation({
  onMutate: async (newItem) => {
    await utils.yourFeature.all.cancel();
    const previous = utils.yourFeature.all.getData();
    utils.yourFeature.all.setData(undefined, (old) => [
      ...(old ?? []),
      newItem,
    ]);
    return { previous };
  },
  onError: (err, newItem, context) => {
    utils.yourFeature.all.setData(undefined, context?.previous);
  },
  onSettled: () => {
    utils.yourFeature.all.invalidate();
  },
});
```

### Real-time subscriptions (if realtime enabled)

```typescript
import { useRealtimeSubscription } from "@gmacko/realtime";

const { data } = useRealtimeSubscription("your-channel", {
  onMessage: (msg) => {
    utils.yourFeature.all.invalidate();
  },
});
```

## Verification Steps

Before considering feature complete:

1. Run `pnpm typecheck` - no type errors
2. Run `pnpm lint` - no lint errors
3. Run `pnpm test` - all tests pass
4. Test in web app (localhost:3000)
5. Test in mobile app (Expo)
6. Verify auth flows work (logged in vs logged out)
7. Check API key auth if applicable
