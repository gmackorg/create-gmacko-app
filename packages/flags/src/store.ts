/**
 * In-Memory Flag Store
 *
 * A simple, synchronous flag store configured by its definitions and by
 * `FlagStoreOptions`: the evaluation environment and per-flag overrides
 * (`FLAG_<NAME>` values the app reads from its validated config). The
 * store itself never reads `process.env`, so it is safe in the Worker
 * bundle.
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

export interface FlagStoreOptions {
  /** The environment flags are evaluated for (`development`, `staging`, `production`). */
  readonly environment?: string | undefined;
  /**
   * Per-flag overrides keyed `FLAG_<FLAGNAME>` (uppercase, hyphens to
   * underscores), the values the deployment supplies; parsed by the flag's
   * default value type.
   */
  readonly overrides?: Readonly<Record<string, string | undefined>> | undefined;
}

/** The override key for a flag: `FLAG_NEW_DASHBOARD` for `newDashboard`. */
export const flagOverrideKey = (flagName: string): string =>
  `FLAG_${flagName.toUpperCase().replace(/-/g, "_")}`;

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
 * The value an allowlisted or rolled-in identifier sees. A boolean flag's
 * "on" state is `true`; every other flag has one value, its default.
 */
function enabledValue<T>(flagDef: FlagDefinition<T>): T {
  if (flagDef.defaultValue !== false) return flagDef.defaultValue;
  // SAFETY: this line is reached only when `defaultValue` is the `false`
  // literal, so the definition is a `FlagDefinition<boolean>` and `true`
  // inhabits its value type `T`.
  return true as T;
}

/**
 * Parse a deployment-supplied `FLAG_*` override string into the flag's own
 * value type, which is fixed by the type of its default value.
 */
function parseOverride<T>(flagDef: FlagDefinition<T>, raw: string): T {
  const isBoolean =
    flagDef.defaultValue === true || flagDef.defaultValue === false;
  // `Number.isFinite` is true for numbers only; it never coerces its argument.
  const isNumber = Number.isFinite(flagDef.defaultValue);
  // SAFETY: each branch produces a value of the same JavaScript type as
  // `flagDef.defaultValue` — boolean for a boolean default, number for a
  // numeric one, the raw string otherwise — and `FlagDefinition<T>` says that
  // type is `T`.
  return (
    isBoolean ? raw === "true" || raw === "1" : isNumber ? Number(raw) : raw
  ) as T;
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
    return {
      value: enabledValue(flagDef),
      reason: "allowlist",
      flagName,
    };
  }

  // Percentage rollout
  if (identifier) {
    const bucket = hashToPercentage(`${flagName}:${identifier}`);
    if (bucket < rollout.percentage) {
      return {
        value: enabledValue(flagDef),
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
export function createFlagStore<T extends FlagDefinitions>(
  definitions: T,
  options: FlagStoreOptions = {},
) {
  // Runtime overrides (can be set programmatically)
  const overrides = new Map<string, unknown>();
  // Deployment-supplied overrides
  const supplied = options.overrides ?? {};

  // Current environment
  let currentEnvironment: string = options.environment ?? "development";

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
    // SAFETY: `T[K]` is a `FlagDefinition<V>` (the `FlagDefinitions`
    // constraint), and `FlagValue<T[K]>` is defined as exactly that inferred
    // `V`. The two are the same type; TypeScript cannot evaluate the
    // conditional in `FlagValue` while `K` is an unresolved type parameter.
    const flagDef = definitions[flagName] as
      | FlagDefinition<FlagValue<T[K]>>
      | undefined;

    if (!flagDef) {
      throw new Error(`Unknown flag: ${flagName}`);
    }

    // 1. Check for runtime override
    if (overrides.has(flagName)) {
      // SAFETY: `setOverride<K>` is the only writer of `overrides`, and it
      // accepts exactly `FlagValue<T[K]>` for the key `flagName: K`, so the
      // value stored under this key has that type. The map is heterogeneous
      // across flags, which is why it cannot say so itself.
      const override = overrides.get(flagName) as FlagValue<T[K]>;
      return {
        value: override,
        reason: "override",
        flagName,
      };
    }

    // 2. Check for a deployment-supplied override
    // Format: FLAG_[FLAGNAME] (uppercase, hyphens to underscores)
    const envValue = supplied[flagOverrideKey(flagName)];
    if (envValue !== undefined) {
      return {
        value: parseOverride(flagDef, envValue),
        reason: "override",
        flagName,
      };
    }

    // 3. Check for environment-specific value
    const envSpecificValue = flagDef.environments?.[currentEnvironment];
    if (envSpecificValue !== undefined) {
      return {
        value: envSpecificValue,
        reason: "environment",
        flagName,
      };
    }

    // 4. Evaluate rollout rules
    const rolloutResult = evaluateRollout(flagDef, flagName, context);
    if (rolloutResult) {
      return rolloutResult;
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
    // SAFETY: `Object.keys` returns an object's own enumerable string keys, so
    // for `definitions: T` they are exactly `keyof T & string`, which is
    // `FlagName<T>`. Its `string[]` signature cannot express that.
    const flagNames = Object.keys(definitions) as Array<FlagName<T>>;
    // SAFETY: the entries below are one per key of `definitions`, i.e. one per
    // `FlagName<T>`, so the record they build has every key of the result type.
    return Object.fromEntries(
      flagNames.map((flagName) => [flagName, getFlagValue(flagName, context)]),
    ) as Record<FlagName<T>, FlagValue<T[FlagName<T>]>>;
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
