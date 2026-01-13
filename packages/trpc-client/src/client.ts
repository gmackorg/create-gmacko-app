import type { TRPCLink } from "@trpc/client";
import { createTRPCClient, httpBatchLink, httpLink } from "@trpc/client";
import superjson from "superjson";

import type { AppRouter } from "./types";

/**
 * Options for creating a tRPC client
 */
export interface CreateClientOptions {
  /**
   * The base URL of the tRPC API endpoint
   * @example "https://api.example.com" or "http://localhost:3000"
   */
  baseUrl: string;

  /**
   * API key for authentication (format: gmk_*)
   * Takes precedence over cookie auth when provided
   */
  apiKey?: string;

  /**
   * Credentials mode for fetch requests
   * Set to "include" to send cookies for session-based auth
   * @default "same-origin"
   */
  credentials?: RequestCredentials;

  /**
   * Additional headers to include in all requests
   */
  headers?: Record<string, string>;

  /**
   * Use batch requests to combine multiple queries into a single HTTP request
   * @default true
   */
  batch?: boolean;

  /**
   * Custom fetch implementation (useful for testing or environments without native fetch)
   */
  fetch?: typeof fetch;
}

export type TRPCClient = ReturnType<typeof createTRPCClient<AppRouter>>;

/**
 * Create a tRPC client for the API
 *
 * @example
 * ```ts
 * // API key authentication
 * const client = createClient({
 *   baseUrl: "https://api.example.com",
 *   apiKey: "gmk_your_api_key_here",
 * });
 *
 * // Cookie/session authentication (browser)
 * const client = createClient({
 *   baseUrl: "https://api.example.com",
 *   credentials: "include",
 * });
 *
 * // Make requests
 * const posts = await client.post.all.query();
 * const newPost = await client.post.create.mutate({ title: "Hello" });
 * ```
 */
export function createClient(options: CreateClientOptions): TRPCClient {
  const {
    baseUrl,
    apiKey,
    credentials = "same-origin",
    headers: customHeaders = {},
    batch = true,
    fetch: customFetch,
  } = options;

  // Normalize base URL - remove trailing slash
  const normalizedBaseUrl = baseUrl.replace(/\/$/, "");
  const url = `${normalizedBaseUrl}/api/trpc`;

  const getHeaders = () => {
    const headers: Record<string, string> = {
      ...customHeaders,
    };

    if (apiKey) {
      headers["Authorization"] = `Bearer ${apiKey}`;
    }

    return headers;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const linkOptions: any = {
    url,
    transformer: superjson,
    headers: getHeaders,
    fetch: customFetch,
  };

  // Only add credentials if we're not using API key auth
  // (API key should work regardless of credentials mode)
  if (!apiKey) {
    linkOptions.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const fetchFn = customFetch ?? fetch;
      return fetchFn(input, {
        ...init,
        credentials,
      });
    };
  } else if (customFetch) {
    linkOptions.fetch = customFetch;
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const link: TRPCLink<AppRouter> = batch
    ? httpBatchLink(linkOptions)
    : httpLink(linkOptions);

  return createTRPCClient<AppRouter>({
    links: [link],
  });
}
