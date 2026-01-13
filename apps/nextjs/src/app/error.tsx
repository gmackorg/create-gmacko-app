"use client";

import { useEffect } from "react";

import { integrations } from "@gmacko/config";
import { captureException } from "@gmacko/monitoring/web";
import { Button } from "@gmacko/ui/button";

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Next.js App Router error boundary.
 * Catches errors in route segments and their children.
 * Does not catch errors in the root layout - use global-error.tsx for that.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling
 */
export default function ErrorPage({ error, reset }: ErrorPageProps) {
  useEffect(() => {
    // Report error to Sentry if enabled
    if (integrations.sentry) {
      captureException(error);
    }

    // Always log to console for debugging
    console.error("Route error:", error);
  }, [error]);

  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16">
      <div className="flex flex-col items-center gap-4 text-center">
        <div className="bg-destructive/10 text-destructive flex size-16 items-center justify-center rounded-full">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            className="size-8"
          >
            <path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" />
            <line x1="12" y1="9" x2="12" y2="13" />
            <line x1="12" y1="17" x2="12.01" y2="17" />
          </svg>
        </div>

        <h1 className="text-3xl font-bold tracking-tight">
          Something went wrong
        </h1>

        <p className="text-muted-foreground max-w-md">
          We apologize for the inconvenience. An unexpected error has occurred.
          Please try again or contact support if the problem persists.
        </p>

        {process.env.NODE_ENV === "development" && (
          <details className="w-full max-w-lg">
            <summary className="text-muted-foreground cursor-pointer text-sm hover:underline">
              View error details
            </summary>
            <div className="bg-muted mt-3 overflow-auto rounded-lg p-4 text-left">
              <p className="text-destructive mb-2 font-mono text-sm font-medium">
                {error.name}: {error.message}
              </p>
              {error.digest && (
                <p className="text-muted-foreground mb-2 font-mono text-xs">
                  Digest: {error.digest}
                </p>
              )}
              {error.stack && (
                <pre className="text-muted-foreground overflow-x-auto font-mono text-xs whitespace-pre-wrap">
                  {error.stack}
                </pre>
              )}
            </div>
          </details>
        )}
      </div>

      <div className="flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Button onClick={() => (window.location.href = "/")} variant="outline">
          Go home
        </Button>
      </div>
    </main>
  );
}
