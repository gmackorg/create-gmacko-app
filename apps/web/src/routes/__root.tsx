/// <reference types="vite/client" />

import { Button } from "@gmacko/ui/button";
import { ThemeProvider, ThemeToggle } from "@gmacko/ui/theme";
import { Toaster } from "@gmacko/ui/toast";
import * as Sentry from "@sentry/react";
import type { QueryClient } from "@tanstack/react-query";
import {
  createRootRouteWithContext,
  type ErrorComponentProps,
  HeadContent,
  Link,
  Outlet,
  Scripts,
  useRouter,
} from "@tanstack/react-router";
import { TanStackRouterDevtools } from "@tanstack/react-router-devtools";
import { createIsomorphicFn } from "@tanstack/react-start";
import { getRequest } from "@tanstack/react-start/server";
import * as React from "react";

import { queries } from "~/lib/api";
import { Providers } from "~/providers";
import appCss from "~/styles.css?url";

const TITLE = "Gmacko App";
const DESCRIPTION =
  "A SaaS-first template with public launch controls, workspace onboarding, and optional product layers.";

/** The page's own origin, for absolute Open Graph URLs. */
const getOrigin = createIsomorphicFn()
  .server(() => new URL(getRequest().url).origin)
  .client(() => window.location.origin);

export const Route = createRootRouteWithContext<{
  queryClient: QueryClient;
}>()({
  loader: async ({ context }) => {
    // Every route reads the session from this one cached answer (guards,
    // the sign-in showcase); it is public, so anonymous is `{ user: null }`.
    await context.queryClient.prefetchQuery(queries.auth.session());
    return { origin: getOrigin() };
  },
  head: ({ loaderData }) => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: TITLE },
      { name: "description", content: DESCRIPTION },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:site_name", content: TITLE },
      { property: "og:type", content: "website" },
      ...(loaderData
        ? [{ property: "og:url", content: loaderData.origin }]
        : []),
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@jullerino" },
      { name: "twitter:creator", content: "@jullerino" },
      {
        name: "theme-color",
        media: "(prefers-color-scheme: light)",
        content: "white",
      },
      {
        name: "theme-color",
        media: "(prefers-color-scheme: dark)",
        content: "black",
      },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", href: "/favicon.ico" },
    ],
  }),
  component: RootComponent,
  errorComponent: RootErrorComponent,
  notFoundComponent: NotFoundComponent,
});

function RootComponent() {
  return (
    <RootDocument>
      <Sentry.ErrorBoundary
        fallback={({ error, resetError }) => (
          <ErrorView error={error} reset={resetError} />
        )}
      >
        <Outlet />
      </Sentry.ErrorBoundary>
    </RootDocument>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  const nonce = useRouter().options.ssr?.nonce;
  // Marks the document once React owns it, so a browser test never submits a
  // form natively by clicking before hydration.
  React.useEffect(() => {
    document.documentElement.dataset.hydrated = "true";
  }, []);
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body className="bg-background text-foreground min-h-screen font-sans antialiased">
        <ThemeProvider nonce={nonce}>
          <Providers>{children}</Providers>
          <div className="fixed right-4 bottom-4 z-30">
            <ThemeToggle />
          </div>
          <Toaster />
        </ThemeProvider>
        {import.meta.env.DEV ? (
          <TanStackRouterDevtools position="bottom-right" />
        ) : null}
        <Scripts />
      </body>
    </html>
  );
}

/** Route-level failures (a loader that threw) render the same view as render errors. */
function RootErrorComponent({ error, reset }: ErrorComponentProps) {
  React.useEffect(() => {
    Sentry.captureException(error);
  }, [error]);
  return (
    <RootDocument>
      <ErrorView error={error} reset={reset} />
    </RootDocument>
  );
}

function ErrorView({ error, reset }: { error: unknown; reset: () => void }) {
  const err = error instanceof Error ? error : new Error(String(error));
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
            aria-hidden="true"
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
        {import.meta.env.DEV ? (
          <details className="w-full max-w-lg">
            <summary className="text-muted-foreground cursor-pointer text-sm hover:underline">
              View error details
            </summary>
            <div className="bg-muted mt-3 overflow-auto rounded-lg p-4 text-left">
              <p className="text-destructive mb-2 font-mono text-sm font-medium">
                {err.name}: {err.message}
              </p>
              {err.stack ? (
                <pre className="text-muted-foreground overflow-x-auto font-mono text-xs whitespace-pre-wrap">
                  {err.stack}
                </pre>
              ) : null}
            </div>
          </details>
        ) : null}
      </div>
      <div className="flex gap-3">
        <Button onClick={reset} variant="default">
          Try again
        </Button>
        <Button variant="outline" asChild>
          <Link to="/">Go home</Link>
        </Button>
      </div>
    </main>
  );
}

function NotFoundComponent() {
  return (
    <main className="container flex min-h-screen flex-col items-center justify-center gap-6 py-16 text-center">
      <h1 className="text-3xl font-bold tracking-tight">Page not found</h1>
      <p className="text-muted-foreground max-w-md">
        The page you are looking for does not exist or has moved.
      </p>
      <Button variant="outline" asChild>
        <Link to="/">Go home</Link>
      </Button>
    </main>
  );
}
