export type { DeprecationMeta, VersionRequirement } from "./deprecation";
export {
  deprecated,
  deprecationRegistry,
  formatDeprecationWarning,
  getDeprecationHeaders,
  isEndpointAvailableInVersion,
} from "./deprecation";
export type { VersionedContext } from "./versioning";
export {
  assertMaxVersion,
  assertMinVersion,
  createVersionMiddlewareContext,
  getVersionResponseHeaders,
  validateVersionHeader,
} from "./versioning";
