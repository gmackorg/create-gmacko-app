import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";
import { Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";

import { integrations } from "@gmacko/config";
import { captureExceptionNative } from "@gmacko/monitoring/native";

interface ErrorBoundaryProps {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  onReset?: () => void;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Error boundary component for React Native/Expo apps.
 * Catches JavaScript errors anywhere in the child component tree,
 * logs them to Sentry (if enabled), and displays a fallback UI.
 */
export class ErrorBoundary extends Component<
  ErrorBoundaryProps,
  ErrorBoundaryState
> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    // Report to Sentry if enabled
    if (integrations.sentry) {
      captureExceptionNative(error);
    }

    // Log to console in development
    console.error("ErrorBoundary caught an error:", error, errorInfo);

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = (): void => {
    this.setState({ hasError: false, error: null });
    this.props.onReset?.();
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // Default error screen
      return (
        <ErrorScreen error={this.state.error} onRetry={this.handleReset} />
      );
    }

    return this.props.children;
  }
}

interface ErrorScreenProps {
  error: Error | null;
  onRetry?: () => void;
  onReport?: () => void;
}

/**
 * User-friendly error screen displayed when an error is caught.
 */
export function ErrorScreen({ error, onRetry, onReport }: ErrorScreenProps) {
  const handleReport = () => {
    if (onReport) {
      onReport();
    } else if (integrations.sentry && error) {
      // Re-capture with user feedback context
      captureExceptionNative(error);
    }
  };

  return (
    <SafeAreaView className="bg-background flex-1">
      <View className="flex-1 items-center justify-center px-6">
        {/* Error Icon */}
        <View className="bg-destructive/10 mb-6 h-20 w-20 items-center justify-center rounded-full">
          <Text className="text-4xl">!</Text>
        </View>

        {/* Title */}
        <Text className="text-foreground mb-2 text-center text-2xl font-bold">
          Something went wrong
        </Text>

        {/* Description */}
        <Text className="text-muted-foreground mb-6 text-center text-base">
          We're sorry, but something unexpected happened. Please try again.
        </Text>

        {/* Error Details (Development only) */}
        {__DEV__ && error && (
          <View className="bg-muted mb-6 w-full rounded-lg p-4">
            <Text className="text-destructive mb-1 font-mono text-sm font-semibold">
              {error.name}: {error.message}
            </Text>
            {error.stack && (
              <Text
                className="text-muted-foreground font-mono text-xs"
                numberOfLines={5}
              >
                {error.stack}
              </Text>
            )}
          </View>
        )}

        {/* Actions */}
        <View className="w-full gap-3">
          {/* Retry Button */}
          {onRetry && (
            <Pressable
              onPress={onRetry}
              className="bg-primary w-full items-center rounded-lg py-4"
            >
              <Text className="text-primary-foreground text-base font-semibold">
                Try Again
              </Text>
            </Pressable>
          )}

          {/* Report Issue Button */}
          <Pressable
            onPress={handleReport}
            className="border-border w-full items-center rounded-lg border py-4"
          >
            <Text className="text-foreground text-base">Report Issue</Text>
          </Pressable>
        </View>

        {/* Sentry Status Indicator */}
        {integrations.sentry && (
          <Text className="text-muted-foreground mt-4 text-center text-xs">
            This error has been automatically reported to our team.
          </Text>
        )}
      </View>
    </SafeAreaView>
  );
}

export default ErrorBoundary;
