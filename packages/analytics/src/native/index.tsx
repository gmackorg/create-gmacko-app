import type { ReactNode } from "react";

import { integrations } from "@gmacko/config";

export interface PostHogNativeConfig {
  apiKey: string;
  apiHost?: string;
}

/**
 * Check if PostHog analytics is enabled
 */
export function isPostHogNativeEnabled(): boolean {
  return integrations.posthog;
}

/**
 * Initialize PostHog for React Native / Expo
 * Stub implementation - extend when PostHog is configured
 */
export async function initPostHogNative(
  _config: PostHogNativeConfig,
): Promise<null> {
  if (!integrations.posthog) {
    return null;
  }
  // TODO: Implement with PostHog.initAsync when enabled
  return null;
}

/**
 * PostHog React Native Provider wrapper
 * Stub implementation - extend when PostHog is configured
 */
export function PostHogNativeProvider({
  children,
}: {
  children: ReactNode;
}): ReactNode {
  // When PostHog is configured, wrap with PostHogProvider from posthog-react-native
  return children;
}

/**
 * Track an event (native)
 */
export function trackEventNative(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (!integrations.posthog) {
    return;
  }
  // TODO: Implement with client.capture when enabled
  void eventName;
  void properties;
}

/**
 * Identify a user (native)
 */
export function identifyUserNative(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  if (!integrations.posthog) {
    return;
  }
  // TODO: Implement with client.identify when enabled
  void userId;
  void properties;
}

/**
 * Reset user identity (native)
 */
export function resetUserNative(): void {
  if (!integrations.posthog) {
    return;
  }
  // TODO: Implement with client.reset when enabled
}
