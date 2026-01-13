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

export async function isFeatureEnabledNative(
  flagKey: string,
  defaultValue = false,
): Promise<boolean> {
  if (!integrations.posthog || !posthogClient) {
    return defaultValue;
  }
  const value = await posthogClient.getFeatureFlag(flagKey);
  return value === true || value === "true" || defaultValue;
}

export async function getFeatureFlagNative<T = string | boolean>(
  flagKey: string,
  defaultValue?: T,
): Promise<T | undefined> {
  if (!integrations.posthog || !posthogClient) {
    return defaultValue;
  }
  const value = await posthogClient.getFeatureFlag(flagKey);
  return (value as T) ?? defaultValue;
}

export async function getFeatureFlagPayloadNative<T = Record<string, unknown>>(
  flagKey: string,
): Promise<T | undefined> {
  if (!integrations.posthog || !posthogClient) {
    return undefined;
  }
  return (await posthogClient.getFeatureFlagPayload(flagKey)) as T | undefined;
}

export async function reloadFeatureFlagsNative(): Promise<void> {
  if (!integrations.posthog || !posthogClient) {
    return;
  }
  await posthogClient.reloadFeatureFlagsAsync();
}

export interface ExperimentNative {
  key: string;
  variant: string | boolean | undefined;
  payload?: Record<string, unknown>;
}

export async function getExperimentNative(
  experimentKey: string,
): Promise<ExperimentNative> {
  if (!integrations.posthog || !posthogClient) {
    return { key: experimentKey, variant: undefined };
  }
  const [variant, payload] = await Promise.all([
    posthogClient.getFeatureFlag(experimentKey),
    posthogClient.getFeatureFlagPayload(experimentKey),
  ]);
  return {
    key: experimentKey,
    variant: variant as string | boolean | undefined,
    payload: payload as Record<string, unknown> | undefined,
  };
}

export function trackExperimentExposureNative(experimentKey: string): void {
  if (!integrations.posthog || !posthogClient) {
    return;
  }
  posthogClient.capture("$feature_flag_called", {
    $feature_flag: experimentKey,
  });
}

export { posthogClient };
