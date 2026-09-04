/**
 * The value contracts shared by the browser (`posthog-js`) and native
 * (`posthog-react-native`) surfaces. Both SDKs describe their own property
 * bags as JSON, but the browser one types that as `Record<string, any>` and
 * the native one does not re-export its `JsonType` at all — so the contract
 * is named once, here, and both surfaces take it.
 */

/**
 * What an analytics property may hold. PostHog ingests events as JSON, so a
 * property value is a JSON value: no `undefined` (a property that has no
 * value is an absent key, and the native SDK's own bag type rejects it), no
 * `Date`, no class instance, no function.
 *
 * The list member is a mutable array rather than a `ReadonlyArray` because
 * the native SDK's own bag type (`PostHogEventProperties`) is, and a bag goes
 * to it unchanged.
 */
export type AnalyticsValue =
  | string
  | number
  | boolean
  | null
  | Array<AnalyticsValue>
  | { readonly [key: string]: AnalyticsValue };

/** The property bag on one event or person profile. */
export interface AnalyticsProperties {
  readonly [key: string]: AnalyticsValue;
}

/** What a feature flag evaluates to: the boolean flag, or the variant key. */
export type FeatureFlagValue = boolean | string;

/**
 * The JSON PostHog stores against a flag, or `undefined` when the flag has
 * none or the flags have not loaded yet. Structurally the SDKs' own
 * `JsonType`, so a payload they return needs no conversion.
 */
export type FeatureFlagPayload =
  | string
  | number
  | boolean
  | null
  | undefined
  | ReadonlyArray<FeatureFlagPayload>
  | { readonly [key: string]: FeatureFlagPayload };
