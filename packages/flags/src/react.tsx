/**
 * React hooks for feature flags
 *
 * Usage:
 *   import { useFlag, useFlagValue, FlagsProvider } from "@gmacko/flags/react";
 *
 *   // In your app root
 *   <FlagsProvider context={{ userId: user.id }}>
 *     <App />
 *   </FlagsProvider>
 *
 *   // In components
 *   const { value, reason } = useFlag("newDashboard");
 *   const isEnabled = useFlagValue("betaFeatures");
 */

"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

import type { FlagContext, FlagEvaluationResult } from "./types";
import {
  flags,
  type RuntimeFlagName,
  getFlag as getFlagFromStore,
  getFlagValue as getFlagValueFromStore,
  isEnabled as isEnabledFromStore,
  getAllFlags as getAllFlagsFromStore,
} from "./flags";

/**
 * Context value for the flags provider
 */
interface FlagsContextValue {
  /** Current evaluation context */
  context: FlagContext;
  /** Update the evaluation context */
  setContext: (context: FlagContext) => void;
  /** Merge additional context */
  mergeContext: (context: Partial<FlagContext>) => void;
}

const FlagsContext = createContext<FlagsContextValue | null>(null);

/**
 * Props for the FlagsProvider component
 */
interface FlagsProviderProps {
  children: ReactNode;
  /** Initial context for flag evaluation */
  context?: FlagContext;
}

/**
 * Provider component for feature flags
 * Provides context for flag evaluation throughout the component tree
 */
export function FlagsProvider({ children, context: initialContext = {} }: FlagsProviderProps) {
  const [context, setContext] = useState<FlagContext>(initialContext);

  const mergeContext = useCallback((newContext: Partial<FlagContext>) => {
    setContext((prev) => ({
      ...prev,
      ...newContext,
      attributes: {
        ...prev.attributes,
        ...newContext.attributes,
      },
    }));
  }, []);

  const value = useMemo(
    () => ({ context, setContext, mergeContext }),
    [context, mergeContext],
  );

  return (
    <FlagsContext.Provider value={value}>{children}</FlagsContext.Provider>
  );
}

/**
 * Hook to access the flags context
 */
export function useFlagsContext(): FlagsContextValue {
  const context = useContext(FlagsContext);
  if (!context) {
    // Return a default context if provider is not used
    return {
      context: {},
      setContext: () => {
        console.warn("FlagsProvider not found. Flag context will not be applied.");
      },
      mergeContext: () => {
        console.warn("FlagsProvider not found. Flag context will not be applied.");
      },
    };
  }
  return context;
}

/**
 * Hook to get a flag with full evaluation result
 *
 * @param flagName - The name of the flag to evaluate
 * @returns The flag evaluation result including value and reason
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const { value, reason } = useFlag("newDashboard");
 *   return value ? <NewDashboard /> : <OldDashboard />;
 * }
 * ```
 */
export function useFlag<K extends RuntimeFlagName>(
  flagName: K,
): FlagEvaluationResult<boolean> {
  const { context } = useFlagsContext();
  return useMemo(
    () => getFlagFromStore(flagName, context),
    [flagName, context],
  );
}

/**
 * Hook to get just the flag value
 *
 * @param flagName - The name of the flag to evaluate
 * @returns The flag value
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const showNewUI = useFlagValue("newDashboard");
 *   return showNewUI ? <NewUI /> : <OldUI />;
 * }
 * ```
 */
export function useFlagValue<K extends RuntimeFlagName>(flagName: K): boolean {
  const { context } = useFlagsContext();
  return useMemo(
    () => getFlagValueFromStore(flagName, context),
    [flagName, context],
  );
}

/**
 * Hook to check if a flag is enabled
 * Alias for useFlagValue for semantic clarity
 *
 * @param flagName - The name of the flag to check
 * @returns Whether the flag is enabled
 *
 * @example
 * ```tsx
 * function MyComponent() {
 *   const isBetaUser = useIsEnabled("betaFeatures");
 *   if (!isBetaUser) return null;
 *   return <BetaFeature />;
 * }
 * ```
 */
export function useIsEnabled<K extends RuntimeFlagName>(flagName: K): boolean {
  const { context } = useFlagsContext();
  return useMemo(
    () => isEnabledFromStore(flagName, context),
    [flagName, context],
  );
}

/**
 * Hook to get all flags
 *
 * @returns All flags with their current values
 *
 * @example
 * ```tsx
 * function DebugPanel() {
 *   const flags = useAllFlags();
 *   return <pre>{JSON.stringify(flags, null, 2)}</pre>;
 * }
 * ```
 */
export function useAllFlags(): Record<RuntimeFlagName, boolean> {
  const { context } = useFlagsContext();
  return useMemo(
    () => getAllFlagsFromStore(context),
    [context],
  );
}

/**
 * Component that conditionally renders children based on a flag
 *
 * @example
 * ```tsx
 * <Feature flag="newDashboard">
 *   <NewDashboard />
 * </Feature>
 *
 * <Feature flag="betaFeatures" fallback={<StandardUI />}>
 *   <BetaUI />
 * </Feature>
 * ```
 */
interface FeatureProps {
  /** The flag to check */
  flag: RuntimeFlagName;
  /** Children to render when flag is enabled */
  children: ReactNode;
  /** Optional fallback to render when flag is disabled */
  fallback?: ReactNode;
}

export function Feature({ flag, children, fallback = null }: FeatureProps) {
  const isEnabled = useIsEnabled(flag);
  return <>{isEnabled ? children : fallback}</>;
}

// Re-export the store for direct access when needed
export { flags };
