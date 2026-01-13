/**
 * Default Runtime Feature Flag Definitions
 *
 * Define your runtime feature flags here.
 * These flags can be evaluated at runtime based on user context,
 * environment, and percentage rollouts.
 *
 * Usage:
 *   import { flags, getFlag, isEnabled } from "@gmacko/flags";
 *
 *   // Get flag value
 *   const value = getFlag("newDashboard");
 *
 *   // Check if enabled with context
 *   const enabled = isEnabled("betaFeature", { userId: "user-123" });
 */

import type { FlagDefinition } from "./types";
import { createFlagStore } from "./store";

/**
 * Define your feature flags here
 *
 * Each flag should have:
 * - defaultValue: The default value when no rules match
 * - description: Human-readable description (optional but recommended)
 * - rollout: Percentage rollout configuration (optional)
 * - environments: Environment-specific overrides (optional)
 */
export const flagDefinitions = {
  /**
   * Example: New dashboard UI
   * Gradually rolling out to users
   */
  newDashboard: {
    defaultValue: false,
    description: "Enable the redesigned dashboard UI",
    rollout: {
      percentage: 0,
      allowlist: [],
    },
    environments: {
      development: true, // Always on in dev
    },
  },

  /**
   * Example: Beta features access
   * For early adopters and testers
   */
  betaFeatures: {
    defaultValue: false,
    description: "Enable access to beta features",
    rollout: {
      percentage: 0,
      allowlist: [], // Add specific user IDs here
    },
  },

  /**
   * Example: Enhanced analytics
   * Feature flag for new analytics implementation
   */
  enhancedAnalytics: {
    defaultValue: false,
    description: "Enable enhanced analytics tracking",
    environments: {
      production: false,
      staging: true,
      development: true,
    },
  },

  /**
   * Example: Maintenance mode
   * Quick toggle for maintenance windows
   */
  maintenanceMode: {
    defaultValue: false,
    description: "Show maintenance mode banner",
  },

  /**
   * Example: Debug mode
   * Enable additional debugging information
   */
  debugMode: {
    defaultValue: false,
    description: "Enable debug mode with additional logging",
    environments: {
      development: true,
    },
  },
} as const satisfies Record<string, FlagDefinition<boolean>>;

/**
 * Type for flag names - enables autocomplete
 */
export type RuntimeFlagName = keyof typeof flagDefinitions;

/**
 * Create the default flag store instance
 */
export const flags = createFlagStore(flagDefinitions);

/**
 * Convenience exports from the default store
 */
export const getFlag = flags.getFlag;
export const getFlagValue = flags.getFlagValue;
export const getAllFlags = flags.getAllFlags;
export const isEnabled = flags.isEnabled;
export const setOverride = flags.setOverride;
export const clearOverride = flags.clearOverride;
export const clearAllOverrides = flags.clearAllOverrides;
export const setEnvironment = flags.setEnvironment;
export const getEnvironment = flags.getEnvironment;
