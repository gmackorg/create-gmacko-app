/**
 * @gmacko/flags - Runtime Feature Flags
 *
 * A type-safe runtime feature flags system for create-gmacko-app.
 *
 * Core exports:
 * - Flag store and evaluation functions
 * - Type definitions for flags
 *
 * Additional entry points:
 * - @gmacko/flags/react - React hooks and components
 * - @gmacko/flags/server - Server-side helpers for tRPC
 *
 * @example
 * ```ts
 * // Basic usage
 * import { isEnabled, getFlag, getAllFlags } from "@gmacko/flags";
 *
 * // Check if a feature is enabled
 * if (isEnabled("newDashboard", { userId: "user-123" })) {
 *   // Show new dashboard
 * }
 *
 * // Get flag with evaluation details
 * const result = getFlag("betaFeatures", { userId: "user-123" });
 * console.log(result.value, result.reason);
 *
 * // Get all flags
 * const allFlags = getAllFlags({ userId: "user-123" });
 * ```
 */

// Export types
export type {
  FlagContext,
  FlagDefinition,
  FlagDefinitions,
  FlagEvaluationResult,
  FlagName,
  FlagProvider,
  FlagValue,
  RolloutConfig,
} from "./types";

// Export store factory
export { createFlagStore, type FlagStore } from "./store";

// Export default flags and convenience functions
export {
  flagDefinitions,
  flags,
  getFlag,
  getFlagValue,
  getAllFlags,
  isEnabled,
  setOverride,
  clearOverride,
  clearAllOverrides,
  setEnvironment,
  getEnvironment,
  type RuntimeFlagName,
} from "./flags";
