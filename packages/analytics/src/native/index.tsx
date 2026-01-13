import type { ReactNode } from "react";
import { useEffect, useState } from "react";
import Constants from "expo-constants";
import { PostHogProvider as PHProvider, PostHog } from "posthog-react-native";

import { integrations } from "@gmacko/config";

export interface PostHogNativeConfig {
  apiKey: string;
  apiHost?: string;
}

let posthogClient: PostHog | null = null;

function getEnvironment(): string {
  const releaseChannel = Constants.expoConfig?.extra?.releaseChannel;
  if (releaseChannel === "production") return "production";
  if (releaseChannel === "staging") return "staging";
  return "development";
}

export function isPostHogNativeEnabled(): boolean {
  return integrations.posthog;
}

export async function initPostHogNative(
  config: PostHogNativeConfig,
): Promise<PostHog | null> {
  if (!integrations.posthog) {
    return null;
  }

  if (!posthogClient) {
    posthogClient = new PostHog(config.apiKey, {
      host: config.apiHost ?? "https://us.i.posthog.com",
    });

    posthogClient.register({
      environment: getEnvironment(),
    });
  }

  return posthogClient;
}

interface PostHogNativeProviderProps {
  children: ReactNode;
  apiKey?: string;
  apiHost?: string;
}

export function PostHogNativeProvider({
  children,
  apiKey,
  apiHost,
}: PostHogNativeProviderProps): ReactNode {
  const [client, setClient] = useState<PostHog | null>(null);

  useEffect(() => {
    if (integrations.posthog && apiKey) {
      initPostHogNative({ apiKey, apiHost }).then(setClient);
    }
  }, [apiKey, apiHost]);

  if (!integrations.posthog || !client) {
    return children;
  }

  return <PHProvider client={client}>{children}</PHProvider>;
}

export function trackEventNative(
  eventName: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!integrations.posthog || !posthogClient) {
    return;
  }
  posthogClient.capture(eventName, properties);
}

export function identifyUserNative(
  userId: string,
  properties?: Record<string, string | number | boolean | null>,
): void {
  if (!integrations.posthog || !posthogClient) {
    return;
  }
  posthogClient.identify(userId, properties);
}

export function resetUserNative(): void {
  if (!integrations.posthog || !posthogClient) {
    return;
  }
  posthogClient.reset();
}

export { posthogClient };
