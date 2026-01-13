/**
 * V1 API Router
 *
 * This module re-exports all existing routers under the v1 namespace.
 * For backward compatibility, v1 is the default version and all existing
 * routers are automatically considered v1 endpoints.
 *
 * When creating v2, copy this pattern and modify routes as needed.
 */

// Re-export all existing routers as v1 routes
export { adminRouter } from "../admin";
export { authRouter } from "../auth";
export { postRouter } from "../post";
export { settingsRouter } from "../settings";

// For convenience, also export a combined v1 router configuration
export {
  appRouter as v1AppRouter,
  type AppRouter as V1AppRouter,
} from "../../root";
