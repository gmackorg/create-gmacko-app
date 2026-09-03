import type { inferRouterInputs, inferRouterOutputs } from "@trpc/server";

import type { AppRouter } from "./root";

type RouterInputs = inferRouterInputs<AppRouter>;
type RouterOutputs = inferRouterOutputs<AppRouter>;

export { type AppRouter, appRouter } from "./root";
export { createTRPCContext } from "./trpc";
export type {
  ApiVersion,
  VersionContext,
  VersioningConfig,
} from "./versioning";
export {
  API_VERSIONS,
  CURRENT_API_VERSION,
  createVersionContext,
  DEFAULT_API_VERSION,
  extractVersionFromHeaders,
  extractVersionFromUrl,
  getVersionResponseHeaders,
  resolveApiVersion,
} from "./versioning";
export type { RouterInputs, RouterOutputs };
