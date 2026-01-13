"use client";

import type { ErrorInfo, ReactNode } from "react";
import { Component } from "react";

import { integrations } from "@gmacko/config";
import { captureException } from "@gmacko/monitoring/web";
import { cn } from "@gmacko/ui";
import { Button } from "@gmacko/ui/button";

interface ErrorBoundaryProps {
  children: ReactNode;
  /** Custom fallback component to render when an error occurs */
  fallback?: ReactNode;
  /** Called when an error is caught */
  onError?: (error: Error, errorInfo: ErrorInfo) => void;
  /** Whether to show a retry button (default: true) */
  showRetry?: boolean;
  /** Custom error title */
  title?: string;
  /** Custom error message */
  message?: string;
  /** Additional CSS classes for the error container */
  className?: string;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

/**
 * Generic error boundary component that catches JavaScript errors in child components.
 * Integrates with Sentry when enabled for error reporting.
 *
 * @example
 * ```tsx
 * <ErrorBoundary
 *   title="Widget Error"
 *   message="This widget encountered a problem"
 * >
 *   <MyWidget />
 * </ErrorBoundary>
 * ```
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
      captureException(error);
    }

    // Log to console in development
    if (process.env.NODE_ENV === "development") {
      console.error("ErrorBoundary caught an error:", error, errorInfo);
    }

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleRetry = (): void => {
    this.setState({ hasError: false, error: null });
  };

  render(): ReactNode {
    if (this.state.hasError) {
      // Use custom fallback if provided
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const { showRetry = true, title, message, className } = this.props;

      return (
        <ErrorFallback
          error={this.state.error}
          onRetry={showRetry ? this.handleRetry : undefined}
          title={title}
          message={message}
          className={className}
        />
      );
    }

    return this.props.children;
  }
}

interface ErrorFallbackProps {
  error: Error | null;
  onRetry?: () => void;
  onReset?: () => void;
  title?: string;
  message?: string;
  className?: string;
  /** Show full error details (default: development only) */
  showDetails?: boolean;
}

/**
 * Reusable error fallback UI component.
 * Can be used standalone or as the fallback for ErrorBoundary.
 */
export function ErrorFallback({
  error,
  onRetry,
  onReset,
  title = "Something went wrong",
  message = "An unexpected error occurred. Please try again.",
  className,
  showDetails = process.env.NODE_ENV === "development",
}: ErrorFallbackProps) {
  return (
    <div
      role="alert"
      className={cn(
        "flex min-h-[200px] flex-col items-center justify-center gap-4 rounded-lg border border-dashed p-8 text-center",
        "border-destructive/50 bg-destructive/5",
        className,
      )}
    >
      <div className="flex flex-col items-center gap-2">
        <div className="bg-destructive/10 text-destructive flex size-12 items-center justify-center rounded-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-6"
          >
            <circle cx="12" cy="12" r="10" />
            <line x1="12" y1="8" x2="12" y2="12" />
            <line x1="12" y1="16" x2="12.01" y2="16" />
          </svg>
        </div>
        <h3 className="text-lg font-semibold">{title}</h3>
        <p className="text-muted-foreground max-w-md text-sm">{message}</p>
      </div>

      {showDetails && error && (
        <details className="w-full max-w-md">
          <summary className="text-muted-foreground cursor-pointer text-xs hover:underline">
            Error details
          </summary>
          <pre className="bg-muted mt-2 overflow-auto rounded-md p-3 text-left text-xs">
            <code>{error.message}</code>
            {error.stack && (
              <>
                {"\n\n"}
                <code className="text-muted-foreground">{error.stack}</code>
              </>
            )}
          </pre>
        </details>
      )}

      <div className="flex gap-2">
        {onRetry && (
          <Button onClick={onRetry} variant="default" size="sm">
            Try again
          </Button>
        )}
        {onReset && (
          <Button onClick={onReset} variant="outline" size="sm">
            Go back
          </Button>
        )}
      </div>
    </div>
  );
}
