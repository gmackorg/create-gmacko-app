import { NotFound } from "@gmacko/domain";
import { useQuery } from "@tanstack/react-query";
import { Stack, useGlobalSearchParams } from "expo-router";
import { SafeAreaView, Text, View } from "react-native";

import { queries } from "~/utils/api";

export default function Post() {
  const { id } = useGlobalSearchParams<{ id: string }>();
  const { data, error, isPending } = useQuery(queries.posts.byId(id));

  // The contract answers 404 `NotFound{resource: "post"}` for an unknown id
  // (the legacy client returned `undefined`); anything else is a real failure.
  if (error instanceof NotFound) {
    return (
      <SafeAreaView className="bg-background">
        <Stack.Screen options={{ title: "Post not found" }} />
        <View className="h-full w-full p-4">
          <Text className="text-primary py-2 text-3xl font-bold">
            Post not found
          </Text>
          <Text className="text-foreground py-4">
            This post no longer exists.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (error) {
    return (
      <SafeAreaView className="bg-background">
        <Stack.Screen options={{ title: "Error" }} />
        <View className="h-full w-full p-4">
          <Text className="text-destructive py-4">{error.message}</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (isPending) return null;

  return (
    <SafeAreaView className="bg-background">
      <Stack.Screen options={{ title: data.title }} />
      <View className="h-full w-full p-4">
        <Text className="text-primary py-2 text-3xl font-bold">
          {data.title}
        </Text>
        <Text className="text-foreground py-4">{data.content}</Text>
      </View>
    </SafeAreaView>
  );
}
