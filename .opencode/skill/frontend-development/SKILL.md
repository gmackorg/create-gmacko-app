---
name: frontend-development
description: Build UI components for web (shadcn/ui) and mobile (NativeWind)
---

# Frontend Development Skill

Use this skill when building UI components for web (shadcn/ui) and mobile (NativeWind).

## Design Philosophy

This template uses:

- **Web**: shadcn/ui + Tailwind CSS v4, rendered by TanStack Start (SSR + hydration; no `"use client"` directives)
- **Mobile**: NativeWind v5 (Tailwind for React Native)
- **Shared**: `@gmacko/ui` components with stories in `packages/ui/src/**/*.stories.tsx` (`pnpm --filter @gmacko/ui storybook`)

Both platforms share the same Tailwind color scheme and design language. Data on both sides comes from the same `queries`/`mutations` (`@gmacko/api-client/queries`).

## Checklist

- [ ] Understand component requirements
- [ ] Check if shadcn/ui component exists
- [ ] Build web component with proper shadcn patterns
- [ ] Build mobile equivalent with NativeWind
- [ ] Ensure responsive design
- [ ] Add loading states
- [ ] Handle error states
- [ ] Test accessibility

## shadcn/ui Patterns (Web)

### Adding Components

```bash
# Interactive shadcn CLI into packages/ui
pnpm ui-add
```

Add a story next to any shared component you touch; Storybook runs from `packages/ui`.

### Using Components

```typescript
// Import from @gmacko/ui
import { Button } from "@gmacko/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@gmacko/ui/card";
import { Input } from "@gmacko/ui/input";

export function MyComponent() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Title</CardTitle>
      </CardHeader>
      <CardContent>
        <Input placeholder="Enter text" />
        <Button>Submit</Button>
      </CardContent>
    </Card>
  );
}
```

### Form Pattern (TanStack Form + the domain schema)

Forms validate with the contract's Standard Schema view (`CreatePostForm`,
`CreateInviteForm`, ...), so the client and the server agree and a 400 from
the API is rare:

```typescript
import { useForm } from "@tanstack/react-form";
import { useMutation } from "@tanstack/react-query";
import { CreatePost, CreatePostForm } from "@gmacko/domain/posts";

import { Button } from "@gmacko/ui/button";
import { Field, FieldError, FieldLabel } from "@gmacko/ui/field";
import { Input } from "@gmacko/ui/input";
import { mutations } from "~/lib/api";

export function CreatePostFormView() {
  const create = useMutation(mutations.posts.create());
  const form = useForm({
    defaultValues: { title: "", content: "" },
    validators: { onSubmit: CreatePostForm },
    onSubmit: async ({ value }) => {
      await create.mutateAsync(new CreatePost(value));
      form.reset();
    },
  });

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void form.handleSubmit();
      }}
      className="space-y-4"
    >
      <form.Field name="title">
        {(field) => {
          const isInvalid = field.state.meta.isTouched && !field.state.meta.isValid;
          return (
            <Field data-invalid={isInvalid}>
              <FieldLabel htmlFor={field.name}>Title</FieldLabel>
              <Input
                id={field.name}
                value={field.state.value}
                onChange={(e) => field.handleChange(e.target.value)}
                onBlur={field.handleBlur}
              />
              {isInvalid && <FieldError errors={field.state.meta.errors} />}
            </Field>
          );
        }}
      </form.Field>
      <Button type="submit" disabled={create.isPending}>
        {create.isPending ? "Submitting..." : "Submit"}
      </Button>
    </form>
  );
}
```

Typed API errors become words through `apps/web/src/lib/errors.ts`
(`Unauthorized`, `Forbidden{scope}`, `Conflict{reason}`, `RateLimited`).

### Dialog Pattern

```typescript
import { useState } from "react";
import { Button } from "@gmacko/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@gmacko/ui/dialog";

export function MyDialog() {
  const [open, setOpen] = useState(false);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button>Open Dialog</Button>
      </DialogTrigger>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Dialog Title</DialogTitle>
          <DialogDescription>
            Description of the dialog content.
          </DialogDescription>
        </DialogHeader>
        {/* Dialog content */}
        <Button onClick={() => setOpen(false)}>Close</Button>
      </DialogContent>
    </Dialog>
  );
}
```

## NativeWind Patterns (Mobile)

### Basic Components

```typescript
import { View, Text, Pressable, TextInput } from "react-native";

// Card equivalent
export function Card({ children }: { children: React.ReactNode }) {
  return (
    <View className="rounded-lg border border-border bg-card p-4 shadow-sm">
      {children}
    </View>
  );
}

// Button equivalent
export function Button({
  children,
  onPress,
  variant = "default",
  disabled,
}: {
  children: React.ReactNode;
  onPress?: () => void;
  variant?: "default" | "destructive" | "outline" | "ghost";
  disabled?: boolean;
}) {
  const baseClasses = "rounded-md px-4 py-2 items-center justify-center";
  const variantClasses = {
    default: "bg-primary",
    destructive: "bg-destructive",
    outline: "border border-input bg-transparent",
    ghost: "bg-transparent",
  };
  const textClasses = {
    default: "text-primary-foreground",
    destructive: "text-destructive-foreground",
    outline: "text-foreground",
    ghost: "text-foreground",
  };

  return (
    <Pressable
      onPress={onPress}
      disabled={disabled}
      className={`${baseClasses} ${variantClasses[variant]} ${disabled ? "opacity-50" : ""}`}
    >
      <Text className={`font-medium ${textClasses[variant]}`}>{children}</Text>
    </Pressable>
  );
}

// Input equivalent
export function Input({
  value,
  onChangeText,
  placeholder,
  ...props
}: {
  value?: string;
  onChangeText?: (text: string) => void;
  placeholder?: string;
}) {
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      placeholder={placeholder}
      placeholderTextColor="#9ca3af"
      className="h-10 rounded-md border border-input bg-background px-3 text-sm text-foreground"
      {...props}
    />
  );
}
```

### List Pattern

```typescript
import { useQuery } from "@tanstack/react-query";
import { FlatList, View, Text, ActivityIndicator } from "react-native";
import { queries } from "~/utils/api";

export function ItemList() {
  const { data, isLoading, isError, refetch } = useQuery(queries.posts.list());

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator size="large" color="#0ea5e9" />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-destructive text-center mb-4">
          Failed to load items
        </Text>
        <Button onPress={() => refetch()}>Retry</Button>
      </View>
    );
  }

  return (
    <FlatList
      data={data}
      contentContainerClassName="p-4 gap-2"
      renderItem={({ item }) => (
        <Card>
          <Text className="text-foreground font-medium">{item.title}</Text>
          <Text className="text-muted-foreground text-sm">{item.description}</Text>
        </Card>
      )}
      keyExtractor={(item) => item.id}
      ListEmptyComponent={
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-muted-foreground">No items found</Text>
        </View>
      }
    />
  );
}
```

## Shared Tailwind Classes Reference

### Colors (both platforms)

```
Background: bg-background, bg-card, bg-muted
Text: text-foreground, text-muted-foreground, text-primary, text-destructive
Borders: border-border, border-input
Primary: bg-primary, text-primary-foreground
```

### Spacing

```
Padding: p-2, p-4, p-6, p-8
Margin: m-2, m-4, mb-2, mt-4
Gap: gap-2, gap-4
```

### Typography

```
Size: text-xs, text-sm, text-base, text-lg, text-xl, text-2xl
Weight: font-normal, font-medium, font-semibold, font-bold
```

### Layout

```
Flex: flex-1, flex-row, items-center, justify-center, justify-between
Rounded: rounded-sm, rounded-md, rounded-lg, rounded-full
```

## Loading and Error States

Always handle these states:

```typescript
// Web (a component under a route whose loader prefetched the query)
import { useQuery } from "@tanstack/react-query";
import { queries } from "~/lib/api";

function MyComponent() {
  const { data, isLoading, isError } = useQuery(queries.posts.list());

  if (isLoading) {
    return <Skeleton className="h-10 w-full" />;
  }

  if (isError) {
    return (
      <Alert variant="destructive">
        <AlertDescription>Failed to load data</AlertDescription>
      </Alert>
    );
  }

  return <div>{/* render data */}</div>;
}

// Mobile
import { queries } from "~/utils/api";

function MyScreen() {
  const { data, isLoading, isError, refetch } = useQuery(queries.posts.list());

  if (isLoading) {
    return (
      <View className="flex-1 items-center justify-center">
        <ActivityIndicator />
      </View>
    );
  }

  if (isError) {
    return (
      <View className="flex-1 items-center justify-center p-4">
        <Text className="text-destructive mb-4">Something went wrong</Text>
        <Button onPress={() => refetch()}>Try Again</Button>
      </View>
    );
  }

  return <View>{/* render data */}</View>;
}
```

## Accessibility

### Web

```typescript
// Use semantic HTML and ARIA
<Button aria-label="Close dialog">
  <XIcon className="h-4 w-4" />
</Button>

// Focus management
<input autoFocus aria-describedby="helper-text" />
<p id="helper-text" className="text-sm text-muted-foreground">
  Helper text
</p>
```

### Mobile

```typescript
// Use accessibility props
<Pressable
  accessible
  accessibilityLabel="Close"
  accessibilityRole="button"
  onPress={onClose}
>
  <XIcon />
</Pressable>

// Group related elements
<View accessible accessibilityLabel={`Item: ${item.title}`}>
  <Text>{item.title}</Text>
  <Text>{item.description}</Text>
</View>
```
