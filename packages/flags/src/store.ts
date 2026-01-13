/**
 * In-Memory Flag Store
 *
 * A simple, synchronous flag store that can be configured via:
 * 1. Direct configuration
 * 2. Environment variables
 *
 * Designed to be extended/replaced with external services like
 * LaunchDarkly or Flagsmith in the future.
 */

import type {
  FlagContext,
  FlagDefinition,
  FlagDefinitions,
  FlagEvaluationResult,
  FlagName,
  FlagValue,
} from "./types";

/**
 * Hash a string to a number between 0-99 for percentage rollouts
 * Uses a simple but consistent hash algorithm
 */
function hashToPercentage(input: string): number {
  let hash = 0;
  for (let i = 0; i < input.length; i++) {
    const char = input.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash % 100);
}

/**
 * Evaluate a flag with rollout configuration
 */
function evaluateRollout<T>(
  flagDef: FlagDefinition<T>,
  flagName: string,
  context?: FlagContext,
): FlagEvaluationResult<T> | null {
  if (!flagDef.rollout) return null;

  const { rollout } = flagDef;
  const identifier =
    context?.userId ?? context?.organizationId ?? context?.email;

  // Check blocklist first
  if (identifier && rollout.blocklist?.includes(identifier)) {
    return {
      value: flagDef.defaultValue,
      reason: "blocklist",
      flagName,
    };
  }

  // Check allowlist
  if (identifier && rollout.allowlist?.includes(identifier)) {
    // For boolean flags, return true; otherwise return the non-default "enabled" state
    const enabledValue = (
      typeof flagDef.defaultValue === "boolean" ? true : flagDef.defaultValue
    ) as T;
    return {
      value: enabledValue,
      reason: "allowlist",
      flagName,
    };
  }

  // Percentage rollout
  if (identifier) {
    const bucket = hashToPercentage(`${flagName}:${identifier}`);
    if (bucket < rollout.percentage) {
      const enabledValue = (
        typeof flagDef.defaultValue === "boolean" ? true : flagDef.defaultValue
      ) as T;
      return {
        value: enabledValue,
        reason: "rollout",
        flagName,
      };
    }
  }

  return null;
}

/**
 * Create a type-safe flag store with the given definitions
 */
export function createFlagStore<T extends FlagDefinitions>(definitions: T) {
  // Runtime overrides (can be set programmatically)
  const overrides = new Map<string, unknown>();

  // Current environment
  let currentEnvironment: string = process.env.NODE_ENV ?? "development";

  /**
   * Set the current environment for flag evaluation
   */
  function setEnvironment(env: string): void {
    currentEnvironment = env;
  }

  /**
   * Get the current environment
   */
  function getEnvironment(): string {
    return currentEnvironment;
  }

  /**
   * Set a runtime override for a flag
   */
  function setOverride<K extends FlagName<T>>(
    flagName: K,
    value: FlagValue<T[K]>,
  ): void {
    overrides.set(flagName, value);
  }

  /**
   * Clear a runtime override
   */
  function clearOverride<K extends FlagName<T>>(flagName: K): void {
    overrides.delete(flagName);
  }

  /**
   * Clear all runtime overrides
   */
  function clearAllOverrides(): void {
    overrides.clear();
  }

  /**
   * Get a flag value with full evaluation logic
   */
  function getFlag<K extends FlagName<T>>(
    flagName: K,
    context?: FlagContext,
  ): FlagEvaluationResult<FlagValue<T[K]>> {
    const flagDef = definitions[flagName] as
      | FlagDefinition<FlagValue<T[K]>>
      | undefined;

    if (!flagDef) {
      throw new Error(`Unknown flag: ${flagName}`);
    }

    // 1. Check for runtime override
    if (overrides.has(flagName)) {
      return {
        value: overrides.get(flagName) as FlagValue<T[K]>,
        reason: "override",
        flagName,
      };
    }

    // 2. Check for environment variable override
    // Format: FLAG_[FLAGNAME] (uppercase, hyphens to underscores)
    const envKey = `FLAG_${flagName.toUpperCase().replace(/-/g, "_")}`;
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      // Parse environment variable based on default value type
      let parsedValue: unknown;
      if (typeof flagDef.defaultValue === "boolean") {
        parsedValue = envValue === "true" || envValue === "1";
      } else if (typeof flagDef.defaultValue === "number") {
        parsedValue = Number(envValue);
      } else {
        parsedValue = envValue;
      }
      return {
        value: parsedValue as FlagValue<T[K]>,
        reason: "override",
        flagName,
      };
    }

    // 3. Check for environment-specific value
    const envSpecificValue = flagDef.environments?.[currentEnvironment];
    if (envSpecificValue !== undefined) {
      return {
        value: envSpecificValue as FlagValue<T[K]>,
        reason: "environment",
        flagName,
      };
    }

    // 4. Evaluate rollout rules
    const rolloutResult = evaluateRollout(flagDef, flagName, context);
    if (rolloutResult) {
      return rolloutResult as FlagEvaluationResult<FlagValue<T[K]>>;
    }

    // 5. Return default value
    return {
      value: flagDef.defaultValue,
      reason: "default",
      flagName,
    };
  }

  /**
   * Get just the flag value (convenience method)
   */
  function getFlagValue<K extends FlagName<T>>(
    flagName: K,
    context?: FlagContext,
  ): FlagValue<T[K]> {
    return getFlag(flagName, context).value;
  }

  /**
   * Get all flags with their current values
   */
  function getAllFlags(
    context?: FlagContext,
  ): Record<FlagName<T>, FlagValue<T[FlagName<T>]>> {
    const result = {} as Record<FlagName<T>, FlagValue<T[FlagName<T>]>>;
    for (const flagName of Object.keys(definitions) as FlagName<T>[]) {
      result[flagName] = getFlagValue(flagName, context);
    }
    return result;
  }

  /**
   * Check if a flag is enabled (for boolean flags)
   */
  function isEnabled<K extends FlagName<T>>(
    flagName: K,
    context?: FlagContext,
  ): boolean {
    const value = getFlagValue(flagName, context);
    return Boolean(value);
  }

  /**
   * Get flag definitions (useful for debugging/admin UIs)
   */
  function getDefinitions(): T {
    return definitions;
  }

  return {
    getFlag,
    getFlagValue,
    getAllFlags,
    isEnabled,
    setOverride,
    clearOverride,
    clearAllOverrides,
    setEnvironment,
    getEnvironment,
    getDefinitions,
  };
}

/**
 * Type for a flag store instance
 */
export type FlagStore<T extends FlagDefinitions> = ReturnType<
  typeof createFlagStore<T>
>;
