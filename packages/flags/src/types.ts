/**
 * Runtime Feature Flags Types
 *
 * These types define the structure for runtime feature flags,
 * as opposed to build-time integration flags in @gmacko/config.
 */

/**
 * Context for evaluating feature flags
 * Can include user info, environment, or any custom attributes
 */
export interface FlagContext {
  /** User identifier for user-targeted flags */
  userId?: string;
  /** User email for email-based targeting */
  email?: string;
  /** User's organization or team */
  organizationId?: string;
  /** Environment (development, staging, production) */
  environment?: string;
  /** Custom attributes for targeting rules */
  attributes?: Record<string, string | number | boolean>;
}

/**
 * Configuration for percentage-based rollouts
 */
export interface RolloutConfig {
  /** Percentage of users who should see the flag (0-100) */
  percentage: number;
  /** Optional: specific user/org IDs that always get the flag */
  allowlist?: string[];
  /** Optional: specific user/org IDs that never get the flag */
  blocklist?: string[];
}

/**
 * Individual flag definition
 */
export interface FlagDefinition<T = boolean> {
  /** Default value when no rules match */
  defaultValue: T;
  /** Human-readable description */
  description?: string;
  /** Rollout configuration for gradual releases */
  rollout?: RolloutConfig;
  /** Environment overrides */
  environments?: Partial<Record<string, T>>;
}

/**
 * Flag definitions registry type
 */
export type FlagDefinitions = Record<string, FlagDefinition<unknown>>;

/**
 * Extract the value type from a flag definition
 */
export type FlagValue<T extends FlagDefinition<unknown>> =
  T extends FlagDefinition<infer V> ? V : never;

/**
 * Extract flag names from a definitions object
 */
export type FlagName<T extends FlagDefinitions> = keyof T & string;

/**
 * Result of flag evaluation with metadata
 */
export interface FlagEvaluationResult<T = boolean> {
  /** The evaluated flag value */
  value: T;
  /** Why this value was returned */
  reason:
    | "default"
    | "environment"
    | "rollout"
    | "allowlist"
    | "blocklist"
    | "override";
  /** Flag name that was evaluated */
  flagName: string;
}

/**
 * Interface for flag providers (for future extensibility)
 * Implement this to integrate with LaunchDarkly, Flagsmith, etc.
 */
export interface FlagProvider {
  /** Initialize the provider */
  initialize(): Promise<void>;
  /** Get a flag value */
  getFlag<T>(flagName: string, context?: FlagContext): Promise<T>;
  /** Get all flags */
  getAllFlags(context?: FlagContext): Promise<Record<string, unknown>>;
  /** Clean up resources */
  destroy(): Promise<void>;
}
