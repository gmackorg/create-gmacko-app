/**
 * @gmacko/trpc-client
 *
 * A vanilla tRPC client for external consumers to interact with the API.
 * Supports both API key authentication and cookie-based session authentication.
 *
 * @example
 * ```ts
 * import { createClient } from "@gmacko/trpc-client";
 *
 * // With API key
 * const client = createClient({
 *   baseUrl: "https://api.example.com",
 *   apiKey: "gmk_your_api_key",
 * });
 *
 * // With cookie auth (browser)
 * const client = createClient({
 *   baseUrl: "https://api.example.com",
 *   credentials: "include",
 * });
 *
 * const posts = await client.post.all.query();
 * ```
 */

export { createClient, type CreateClientOptions } from "./client";
export type { TRPCClient } from "./client";

// Re-export types from @gmacko/api for convenience
// Users can import these directly if they have @gmacko/api installed
export type { AppRouter, RouterInputs, RouterOutputs } from "./types";
