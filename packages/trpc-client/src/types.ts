/**
 * Type definitions for the tRPC client
 *
 * These types are re-exported from @gmacko/api for convenience.
 * If you have @gmacko/api installed as a peer dependency, you can
 * import these types directly from there for the full type definitions.
 */

import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

// Import the AppRouter type from @gmacko/api
// This is a devDependency, so it will be available during build
// Users who want full type inference should install @gmacko/api as a peer dep
import type { AppRouter } from "@gmacko/api";

/**
 * Inference helpers for input types
 * @example
 * type PostByIdInput = RouterInputs['post']['byId']
 *      ^? { id: string }
 */
export type RouterInputs = inferRouterInputs<AppRouter>;

/**
 * Inference helpers for output types
 * @example
 * type AllPostsOutput = RouterOutputs['post']['all']
 *      ^? Post[]
 */
export type RouterOutputs = inferRouterOutputs<AppRouter>;

export type { AppRouter };
