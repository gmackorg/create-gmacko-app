"use client";

import type { ReactNode } from "react";

import { integrations } from "@gmacko/config";

export interface PostHogWebConfig {
  apiKey: string;
  apiHost?: string;
}

/**
 * Check if PostHog analytics is enabled
 */
export function isPostHogEnabled(): boolean {
  return integrations.posthog;
}

/**
 * Initialize PostHog for web
 * Stub implementation - extend when PostHog is configured
 */
export function initPostHogWeb(_config: PostHogWebConfig): void {
  if (!integrations.posthog) {
    return;
  }
  // TODO: Implement with posthog.init when enabled
}

/**
 * PostHog React Provider wrapper
 * Returns children directly - extend when PostHog is configured
 */
export function PostHogProvider({
  children,
}: {
  children: ReactNode;
  apiKey?: string;
  apiHost?: string;
}): ReactNode {
  // When PostHog is configured, wrap with PostHogProvider from posthog-js/react
  return children;
}

/**
 * Track an event
 */
export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (!integrations.posthog) {
    return;
  }
  // TODO: Implement with posthog.capture(eventName, properties)
  void eventName;
  void properties;
}

/**
 * Identify a user
 */
export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  if (!integrations.posthog) {
    return;
  }
  // TODO: Implement with posthog.identify(userId, properties)
  void userId;
  void properties;
}

/**
 * Reset user identity (on logout)
 */
export function resetUser(): void {
  if (!integrations.posthog) {
    return;
  }
  // TODO: Implement with posthog.reset()
}
