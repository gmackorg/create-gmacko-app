/**
 * Server-side helpers for feature flags
 *
 * Usage in tRPC procedures:
 *   import { withFlags, requireFlag, getFlagsForUser } from "@gmacko/flags/server";
 *
 *   // In a procedure
 *   export const myProcedure = protectedProcedure
 *     .use(withFlags)
 *     .query(async ({ ctx }) => {
 *       if (ctx.flags.isEnabled("betaFeatures")) {
 *         // Beta-only logic
 *       }
 *     });
 */
import type { RuntimeFlagName } from "./flags";
import type { FlagContext, FlagEvaluationResult } from "./types";
import {
  clearOverride,
  flags,
  getAllFlags,
  getFlag,
  getFlagValue,
  isEnabled,
  setEnvironment,
  setOverride,
} from "./flags";

/**
 * Create a flag context from a user object
 * Adapt this to your user model
 */
export interface UserLike {
  id: string;
  email?: string | null;
  organizationId?: string | null;
}

/**
 * Build a flag context from a user-like object
 */
export function buildFlagContext(user?: UserLike | null): FlagContext {
  if (!user) return {};

  return {
    userId: user.id,
    email: user.email ?? undefined,
    organizationId: user.organizationId ?? undefined,
    environment: process.env.NODE_ENV,
  };
}

/**
 * Get all flags evaluated for a specific user
 * Useful for sending flag state to the client
 */
export function getFlagsForUser(
  user?: UserLike | null,
): Record<RuntimeFlagName, boolean> {
  const context = buildFlagContext(user);
  return getAllFlags(context);
}

/**
 * Check if a flag is enabled for a specific user
 */
export function isFlagEnabledForUser(
  flagName: RuntimeFlagName,
  user?: UserLike | null,
): boolean {
  const context = buildFlagContext(user);
  return isEnabled(flagName, context);
}

/**
 * Get a flag value for a specific user
 */
export function getFlagForUser(
  flagName: RuntimeFlagName,
  user?: UserLike | null,
): FlagEvaluationResult<boolean> {
  const context = buildFlagContext(user);
  return getFlag(flagName, context);
}

/**
 * tRPC middleware context type
 * Add this to your context type
 */
export interface FlagsMiddlewareContext {
  flags: {
    getFlag: <K extends RuntimeFlagName>(
      flagName: K,
    ) => FlagEvaluationResult<boolean>;
    getFlagValue: <K extends RuntimeFlagName>(flagName: K) => boolean;
    isEnabled: <K extends RuntimeFlagName>(flagName: K) => boolean;
    getAllFlags: () => Record<RuntimeFlagName, boolean>;
  };
}

/**
 * Create flags context for tRPC middleware
 * Use this in your createContext function or middleware
 *
 * @example
 * ```ts
 * // In your tRPC context
 * export const createContext = async (opts: CreateContextOptions) => {
 *   const user = await getUser(opts);
 *   return {
 *     ...opts,
 *     user,
 *     ...createFlagsContext(user),
 *   };
 * };
 * ```
 */
export function createFlagsContext(
  user?: UserLike | null,
): FlagsMiddlewareContext {
  const context = buildFlagContext(user);

  return {
    flags: {
      getFlag: <K extends RuntimeFlagName>(flagName: K) =>
        getFlag(flagName, context),
      getFlagValue: <K extends RuntimeFlagName>(flagName: K) =>
        getFlagValue(flagName, context),
      isEnabled: <K extends RuntimeFlagName>(flagName: K) =>
        isEnabled(flagName, context),
      getAllFlags: () => getAllFlags(context),
    },
  };
}

/**
 * Helper to throw if a flag is not enabled
 * Useful for feature-gated procedures
 *
 * @example
 * ```ts
 * export const betaProcedure = protectedProcedure.query(({ ctx }) => {
 *   requireFlagEnabled("betaFeatures", ctx.user);
 *   // Beta-only logic
 * });
 * ```
 */
export function requireFlagEnabled(
  flagName: RuntimeFlagName,
  user?: UserLike | null,
): void {
  if (!isFlagEnabledForUser(flagName, user)) {
    throw new Error(`Feature "${flagName}" is not enabled`);
  }
}

/**
 * Helper class for advanced flag operations
 * Useful for testing and admin operations
 */
export class FlagAdmin {
  /**
   * Temporarily enable a flag (useful for testing)
   */
  static enable(flagName: RuntimeFlagName): void {
    setOverride(flagName, true);
  }

  /**
   * Temporarily disable a flag (useful for testing)
   */
  static disable(flagName: RuntimeFlagName): void {
    setOverride(flagName, false);
  }

  /**
   * Reset a flag to its default evaluation
   */
  static reset(flagName: RuntimeFlagName): void {
    clearOverride(flagName);
  }

  /**
   * Set the environment for flag evaluation
   */
  static setEnvironment(env: string): void {
    setEnvironment(env);
  }
}

// Re-export core functions for direct server-side use
export {
  flags,
  getFlag,
  getFlagValue,
  isEnabled,
  getAllFlags,
  setOverride,
  clearOverride,
  setEnvironment,
  type RuntimeFlagName,
};
