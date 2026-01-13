"use client";

import type { ReactNode } from "react";
import { useEffect } from "react";
import posthog from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";

import { integrations } from "@gmacko/config";

export interface PostHogWebConfig {
  apiKey: string;
  apiHost?: string;
}

function detectEnvironment(): string {
  if (typeof window === "undefined") return "server";
  if (process.env.VERCEL_ENV) {
    return process.env.VERCEL_ENV === "preview"
      ? "staging"
      : process.env.VERCEL_ENV;
  }
  return process.env.NODE_ENV ?? "development";
}

export function isPostHogEnabled(): boolean {
  return integrations.posthog;
}

export function initPostHogWeb(config: PostHogWebConfig): void {
  if (!integrations.posthog || typeof window === "undefined") {
    return;
  }

  if (!posthog.__loaded) {
    posthog.init(config.apiKey, {
      api_host: config.apiHost ?? "https://us.i.posthog.com",
      person_profiles: "identified_only",
      capture_pageview: false,
      capture_pageleave: true,
    });

    posthog.register({
      environment: detectEnvironment(),
    });
  }
}

interface PostHogProviderProps {
  children: ReactNode;
  apiKey: string;
  apiHost?: string;
}

export function PostHogProvider({
  children,
  apiKey,
  apiHost,
}: PostHogProviderProps): ReactNode {
  useEffect(() => {
    if (integrations.posthog && apiKey) {
      initPostHogWeb({ apiKey, apiHost });
    }
  }, [apiKey, apiHost]);

  if (!integrations.posthog) {
    return children;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export function trackEvent(
  eventName: string,
  properties?: Record<string, unknown>,
): void {
  if (!integrations.posthog) {
    return;
  }
  posthog.capture(eventName, properties);
}

export function identifyUser(
  userId: string,
  properties?: Record<string, unknown>,
): void {
  if (!integrations.posthog) {
    return;
  }
  posthog.identify(userId, properties);
}

export function resetUser(): void {
  if (!integrations.posthog) {
    return;
  }
  posthog.reset();
}

export { posthog };
