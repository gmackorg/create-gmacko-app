/**
 * Type definitions for the tRPC client
 *
 * These types are re-exported from @gmacko/legacy-api for convenience.
 * If you have @gmacko/legacy-api installed as a peer dependency, you can
 * import these types directly from there for the full type definitions.
 */

// Import the AppRouter type from @gmacko/legacy-api
// This is a devDependency, so it will be available during build
// Users who want full type inference should install @gmacko/legacy-api as a peer dep
import type { AppRouter } from "@gmacko/legacy-api";
import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

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
