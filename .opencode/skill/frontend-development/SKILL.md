---
name: frontend-development
description: Build UI components for web (shadcn/ui) and mobile (NativeWind)
---

# Frontend Development Skill

Use this skill when building UI components for web (shadcn/ui) and mobile (NativeWind).

## Design Philosophy

This template uses:

- **Web**: shadcn/ui + Tailwind CSS v4
- **Mobile**: NativeWind v5 (Tailwind for React Native)
- **Shared**: Consistent design tokens and component patterns

Both platforms share the same Tailwind color scheme and design language.

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
# Add single component
pnpm ui-add button

# Add multiple components
pnpm ui-add button card dialog form input label

# See all available components
pnpm ui-add --help
```

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

### Form Pattern (with React Hook Form)

```typescript
"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { useForm } from "react-hook-form";
import { z } from "zod";

import { Button } from "@gmacko/ui/button";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@gmacko/ui/form";
import { Input } from "@gmacko/ui/input";

const formSchema = z.object({
  name: z.string().min(2, "Name must be at least 2 characters"),
  email: z.string().email("Invalid email address"),
});

type FormValues = z.infer<typeof formSchema>;

export function MyForm({ onSubmit }: { onSubmit: (data: FormValues) => void }) {
  const form = useForm<FormValues>({
    resolver: zodResolver(formSchema),
    defaultValues: { name: "", email: "" },
  });

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="name"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Name</FormLabel>
              <FormControl>
                <Input {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <FormField
          control={form.control}
          name="email"
          render={({ field }) => (
            <FormItem>
              <FormLabel>Email</FormLabel>
              <FormControl>
                <Input type="email" {...field} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        <Button type="submit" disabled={form.formState.isSubmitting}>
          {form.formState.isSubmitting ? "Submitting..." : "Submit"}
        </Button>
      </form>
    </Form>
  );
}
```

### Dialog Pattern

```typescript
"use client";

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
import { FlatList, View, Text, ActivityIndicator } from "react-native";
import { api } from "~/utils/api";

export function ItemList() {
  const { data, isLoading, isError, refetch } = api.items.all.useQuery();

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
// Web
function MyComponent() {
  const { data, isLoading, isError } = api.items.all.useQuery();

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
function MyScreen() {
  const { data, isLoading, isError, refetch } = api.items.all.useQuery();

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
