/**
 * `@gmacko/analytics/web`: PostHog for the browser. Nothing here reads
 * `process.env`; the key, host and environment are props from the app's
 * validated client config.
 *
 * CSP: the web app serves `script-src 'self' 'nonce-…'`, and posthog-js
 * lazily injects `<script>` tags from its assets host (session replay,
 * surveys, exception autocapture, web vitals) that such a policy blocks.
 * The template default therefore turns every lazily-loaded feature off
 * (`cspSafeDefaults`). To enable one, keep the policy and stamp the nonce
 * on the injected script instead (`cspNonceScriptHook`, the upgrade path):
 *
 *   initPostHogWeb({ apiKey, options: { disable_session_recording: false,
 *     disable_external_dependency_loading: false,
 *     prepare_external_dependency_script: cspNonceScriptHook() } })
 */
import { integrations } from "@gmacko/config";
import posthog, { type PostHogConfig } from "posthog-js";
import { PostHogProvider as PHProvider } from "posthog-js/react";
import type { ReactNode } from "react";
import { useEffect } from "react";

import type {
  AnalyticsProperties,
  FeatureFlagPayload,
  FeatureFlagValue,
} from "../properties";

export type {
  AnalyticsProperties,
  AnalyticsValue,
  FeatureFlagPayload,
  FeatureFlagValue,
} from "../properties";

export interface PostHogWebConfig {
  apiKey: string;
  apiHost?: string | undefined;
  /** Registered on every event as `environment`; unset → not registered. */
  environment?: string | undefined;
  /** Overrides merged over `cspSafeDefaults`. */
  options?: Partial<PostHogConfig> | undefined;
}

/**
 * No lazily-loaded feature: nothing PostHog does can inject a script the
 * app's nonce-based CSP would refuse. Autocapture and page-leave events
 * stay on, they need no extra script.
 */
export const cspSafeDefaults: Partial<PostHogConfig> = {
  person_profiles: "identified_only",
  capture_pageview: false,
  capture_pageleave: true,
  capture_exceptions: false,
  disable_session_recording: true,
  disable_surveys: true,
  disable_web_experiments: true,
  disable_external_dependency_loading: true,
};

/**
 * `prepare_external_dependency_script` that copies the page's CSP nonce
 * (`<meta property="csp-nonce">`, published by the SSR render) onto each
 * script PostHog injects, so a lazily-loaded feature can be enabled without
 * widening `script-src`. Returns `null` (skip the script) when the page has
 * no nonce, which keeps the console free of CSP violations.
 */
export const cspNonceScriptHook =
  (metaProperty = "csp-nonce") =>
  (script: HTMLScriptElement): HTMLScriptElement | null => {
    const nonce = document
      .querySelector(`meta[property="${metaProperty}"]`)
      ?.getAttribute("content");
    if (!nonce) return null;
    script.nonce = nonce;
    return script;
  };

export function isPostHogEnabled(): boolean {
  return integrations.posthog;
}

export function initPostHogWeb(config: PostHogWebConfig): void {
  if (!integrations.posthog || typeof window === "undefined") {
    return;
  }

  if (!posthog.__loaded) {
    posthog.init(config.apiKey, {
      ...cspSafeDefaults,
      api_host: config.apiHost ?? "https://us.i.posthog.com",
      ...config.options,
    });

    if (config.environment) {
      posthog.register({ environment: config.environment });
    }
  }
}

interface PostHogProviderProps extends PostHogWebConfig {
  children: ReactNode;
}

export function PostHogProvider({
  children,
  apiKey,
  apiHost,
  environment,
  options,
}: PostHogProviderProps): ReactNode {
  useEffect(() => {
    if (integrations.posthog && apiKey) {
      initPostHogWeb({ apiKey, apiHost, environment, options });
    }
  }, [apiKey, apiHost, environment, options]);

  if (!integrations.posthog) {
    return children;
  }

  return <PHProvider client={posthog}>{children}</PHProvider>;
}

export function trackEvent(
  eventName: string,
  properties?: AnalyticsProperties,
): void {
  if (!integrations.posthog) {
    return;
  }
  posthog.capture(eventName, properties);
}

export function identifyUser(
  userId: string,
  properties?: AnalyticsProperties,
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

// Feature Flags

export function isFeatureEnabled(
  flagKey: string,
  defaultValue = false,
): boolean {
  if (!integrations.posthog) {
    return defaultValue;
  }
  return posthog.isFeatureEnabled(flagKey) ?? defaultValue;
}

export function getFeatureFlag(
  flagKey: string,
  defaultValue?: FeatureFlagValue,
): FeatureFlagValue | undefined {
  if (!integrations.posthog) {
    return defaultValue;
  }
  return posthog.getFeatureFlag(flagKey) ?? defaultValue;
}

export function getFeatureFlagPayload(flagKey: string): FeatureFlagPayload {
  if (!integrations.posthog) {
    return undefined;
  }
  return posthog.getFeatureFlagPayload(flagKey);
}

export function onFeatureFlags(callback: () => void): void {
  if (!integrations.posthog) {
    callback();
    return;
  }
  posthog.onFeatureFlags(callback);
}

export function reloadFeatureFlags(): void {
  if (!integrations.posthog) {
    return;
  }
  posthog.reloadFeatureFlags();
}

// A/B Testing / Experiments

export interface Experiment {
  key: string;
  variant: FeatureFlagValue | undefined;
  payload?: FeatureFlagPayload;
}

export function getExperiment(experimentKey: string): Experiment {
  if (!integrations.posthog) {
    return { key: experimentKey, variant: undefined };
  }
  return {
    key: experimentKey,
    variant: posthog.getFeatureFlag(experimentKey),
    payload: posthog.getFeatureFlagPayload(experimentKey),
  };
}

export function trackExperimentExposure(experimentKey: string): void {
  if (!integrations.posthog) {
    return;
  }
  posthog.capture("$feature_flag_called", {
    $feature_flag: experimentKey,
    $feature_flag_response: posthog.getFeatureFlag(experimentKey),
  });
}

export { posthog };
