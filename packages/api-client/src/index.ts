/**
 * `@gmacko/api-client`: the typed client over `AppApi` for every consumer
 * (web SSR and browser, Expo, the operator CLI and MCP server). Deps:
 * `effect` and `@gmacko/domain`; no React, no `node:`, `fetch`/`Headers`
 * from the platform. The TanStack Query layer lives under `./queries`.
 */
export {
  type ApiClient,
  type ApiClientMethods,
  type ApiClientOptions,
  makeApiClient,
  type Runner,
} from "./client";
export {
  ApiClientError,
  type ApiClientErrorKind,
  type RequestTrace,
  traceOf,
} from "./errors";
export {
  FORWARDED_HEADERS,
  forwardedHeaders,
  type HeadersProvider,
  type HeadersRecord,
  pickHeaders,
  REQUEST_ID_HEADER,
  TRACE_ID_HEADER,
  type Transport,
} from "./transport";
