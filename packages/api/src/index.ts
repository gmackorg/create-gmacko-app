/**
 * `@gmacko/api`: the services and handler groups behind `AppApi`
 * (@gmacko/domain). Framework-free: only `effect/unstable/httpapi` knows
 * HTTP, and only the app knows the platform.
 */

export { httpServerDuration } from "@gmacko/telemetry";
export { Background, type BackgroundShape } from "./background";
export { RequestTrace, type RequestTraceShape } from "./boundary";
export {
  AppConfig,
  type AppConfigShape,
  type AuthConfig,
  canAutoCreateAccounts,
  defaultFeatures,
  type FeatureFlags,
  type OAuthClientConfig,
  type Stage,
} from "./config";
export {
  type ApiHandler,
  makeWebHandler,
  REQUEST_ID_HEADER,
  type RequestServices,
  TRACE_ID_HEADER,
  type WebHandler,
  type WebHandlerOptions,
} from "./handler";
export { Health, type HealthShape } from "./health/service";
export { Jobs, type JobsShape } from "./jobs";
export {
  ApiLive,
  type ApiLiveOptions,
  type AppServices,
  AuthSecurityConfigLive,
  makeApiLive,
} from "./layer";
export { Posts, type PostsShape } from "./posts/service";
export {
  consumeForRequest,
  defaultRateLimits,
  developmentRateLimits,
  type RateLimitBinding,
  type RateLimitBindings,
  RateLimiter,
  type RateLimiterShape,
  type RateLimitPolicy,
  type RateLimits,
  rateLimitedResponse,
  rateLimitsFor,
} from "./rate-limit";
