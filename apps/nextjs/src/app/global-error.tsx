"use client";

import { useEffect } from "react";

import { integrations } from "@gmacko/config";
import { captureException } from "@gmacko/monitoring/web";

interface GlobalErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

/**
 * Next.js global error boundary.
 * Catches errors in the root layout and provides a fallback UI.
 *
 * NOTE: This component must define its own <html> and <body> tags
 * since it replaces the root layout when active.
 *
 * @see https://nextjs.org/docs/app/building-your-application/routing/error-handling#handling-errors-in-root-layouts
 */
export default function GlobalError({ error, reset }: GlobalErrorProps) {
  useEffect(() => {
    // Report error to Sentry if enabled
    if (integrations.sentry) {
      captureException(error);
    }

    // Always log to console for debugging
    console.error("Global error:", error);
  }, [error]);

  return (
    <html lang="en">
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16">
          <div className="flex flex-col items-center gap-4 text-center">
            <div
              className="flex size-16 items-center justify-center rounded-full"
              style={{ backgroundColor: "hsl(0 84% 60% / 0.1)" }}
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 24 24"
                fill="none"
                stroke="hsl(0 84% 60%)"
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
              Application Error
            </h1>

            <p style={{ color: "hsl(240 5% 65%)" }} className="max-w-md">
              A critical error has occurred. We apologize for the inconvenience.
              Please try refreshing the page.
            </p>

            {process.env.NODE_ENV === "development" && (
              <details className="w-full max-w-lg">
                <summary
                  className="cursor-pointer text-sm hover:underline"
                  style={{ color: "hsl(240 5% 65%)" }}
                >
                  View error details
                </summary>
                <div
                  className="mt-3 overflow-auto rounded-lg p-4 text-left"
                  style={{ backgroundColor: "hsl(240 5% 96%)" }}
                >
                  <p
                    className="mb-2 font-mono text-sm font-medium"
                    style={{ color: "hsl(0 84% 60%)" }}
                  >
                    {error.name}: {error.message}
                  </p>
                  {error.digest && (
                    <p
                      className="mb-2 font-mono text-xs"
                      style={{ color: "hsl(240 5% 65%)" }}
                    >
                      Digest: {error.digest}
                    </p>
                  )}
                  {error.stack && (
                    <pre
                      className="overflow-x-auto font-mono text-xs whitespace-pre-wrap"
                      style={{ color: "hsl(240 5% 65%)" }}
                    >
                      {error.stack}
                    </pre>
                  )}
                </div>
              </details>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={reset}
              className="inline-flex h-10 items-center justify-center rounded-md px-6 text-sm font-medium text-white transition-colors"
              style={{ backgroundColor: "hsl(240 5% 26%)" }}
            >
              Try again
            </button>
            <button
              onClick={() => (window.location.href = "/")}
              className="inline-flex h-10 items-center justify-center rounded-md border px-6 text-sm font-medium transition-colors"
              style={{
                borderColor: "hsl(240 6% 90%)",
                backgroundColor: "transparent",
              }}
            >
              Go home
            </button>
          </div>
        </main>
      </body>
    </html>
  );
}
