/**
 * The only module in the repo allowed to import `cloudflare:workers`.
 *
 * Bindings enter Effect here, as services (`AppConfig`, `Database`,
 * `Background`, `Auth`, observability); `@gmacko/api` turns them into the
 * web handler. Every request shares the ManagedRuntime built below, and
 * module scope does no I/O.
 */
import { env, waitUntil } from "cloudflare:workers";
import {
  type ApiHandler,
  AppConfig,
  Background,
  consumeForRequest,
  Jobs,
  makeWebHandler,
  type RateLimitBindings,
  RateLimiter,
  rateLimitedResponse,
  rateLimitsFor,
  WebhookEvents,
} from "@gmacko/api";
import { RequestContext } from "@gmacko/auth/request-context";
import { Auth } from "@gmacko/auth/service";
import { Database } from "@gmacko/db";
import type { RateLimitScope } from "@gmacko/domain";
import { flushAfter, flushTelemetry, Observability } from "@gmacko/telemetry";
import { Context, Effect, Layer, ManagedRuntime } from "effect";

import { env as clientEnv } from "~/env";
import { AuthLive } from "./auth";
import { fromBindings, webFromBindings } from "./config";
import { createStorageHandlers } from "./storage";
import type { StripeWebhookLedger } from "./stripe-webhook";

/**
 * Deliberately fails fast at module load: a misconfigured STAGE should stop
 * the Worker from starting (visible in the deploy) rather than surface as a
 * 500 on the first request.
 */
export const config = fromBindings(env, { version: __APP_VERSION__ });

/** What the web app itself reads from the bindings, beyond `AppConfig`. */
export const webConfig = webFromBindings(env, {
  posthogHost: clientEnv.VITE_POSTHOG_HOST,
  sentryDsn: clientEnv.VITE_SENTRY_DSN,
});

const AppConfigLive = Layer.succeed(AppConfig)(config);
// D1 bindings are safe to hold at module scope; one client per isolate.
const DatabaseLive = Database.layer(env.DB);

/**
 * wrangler.jsonc `ratelimits`, keyed by the contract's `RateLimitScope`.
 * `signup` has no binding on purpose: a Rate Limiting binding counts per
 * colo, and sign-up plus magic-link send are the two paths where the counter
 * has to be global, so they fall through to `rate_limit_window` in D1
 * (packages/api/src/rate-limit.ts).
 *
 * A binding is `undefined` wherever the host does not declare it (the
 * pool-workers suites that build their own Miniflare options), and that scope
 * then uses D1 too — the same code path, one layer less.
 */
const rateLimitBindings: RateLimitBindings = {
  auth: env.RATE_LIMIT_AUTH,
  contact: env.RATE_LIMIT_CONTACT,
  "api-keys": env.RATE_LIMIT_API_KEYS,
  "operator-api": env.RATE_LIMIT_OPERATOR_API,
};

/**
 * One layer object, used twice: in `ServicesLive` (so the auth route below
 * can reach the limiter through the shared runtime) and as `makeWebHandler`'s
 * `rateLimiter` option (so the API's middleware uses it instead of the
 * in-memory default). The shared memo map makes that one instance.
 */
const RateLimiterLive = RateLimiter.layerCloudflare({
  bindings: rateLimitBindings,
  // The D1 scope's allowance and the `Retry-After` on a refusal; the
  // bindings' own numbers are in wrangler.jsonc and must agree with these.
  limits: rateLimitsFor(config.stage),
}).pipe(Layer.provide(DatabaseLive));

/** Every service the app provides, independent of HTTP. Shared by all handlers. */
const ServicesLive = Layer.mergeAll(
  AppConfigLive,
  Background.layer(waitUntil),
  DatabaseLive,
  AuthLive.pipe(Layer.provide(Layer.mergeAll(AppConfigLive, DatabaseLive))),
  // The Cron Trigger's work (worker.ts `scheduled`).
  Jobs.layer.pipe(Layer.provide(DatabaseLive)),
  // The Stripe webhook idempotency ledger (src/routes/api.webhooks.stripe.ts).
  WebhookEvents.layer.pipe(Layer.provide(DatabaseLive)),
  RateLimiterLive,
  // JSON console logging (Workers Logs) plus, with an endpoint, OTLP export
  // of traces, logs and metrics; flushed after every request (below).
  Observability.layer({
    endpoint: config.otlp.endpoint,
    headers: config.otlp.headers,
    serviceName: "gmacko-web",
    serviceVersion: config.version,
    logging: {
      base: { stage: config.stage },
      level: config.stage === "development" ? "debug" : "info",
    },
  }),
);

/** One runtime per isolate; `scheduled` and queue handlers run effects here. */
export const runtime = ManagedRuntime.make(ServicesLive);

/**
 * Drains the telemetry exporters now (always settles: `flushTelemetry` is
 * bounded and never fails). The Worker entry hands this to `waitUntil`
 * after a cron tick; HTTP handlers go through `Background` below instead.
 */
export const flush = (): Promise<void> => runtime.runPromise(flushTelemetry);

/**
 * Ends every request by handing the telemetry flush to `waitUntil` (through
 * `Background`), so a span is exported even though the isolate idles right
 * after the response.
 */
const flushOnBackground = (): Promise<void> =>
  runtime.runPromise(
    Effect.flatMap(Background, (background) => background.run(flushTelemetry)),
  );
const flushed = <Args extends ReadonlyArray<unknown>>(
  respond: (...args: Args) => Promise<Response>,
) => flushAfter(respond, flushOnBackground);

/** Longest `x-test-delay` honoured, so a stray header cannot hold a request forever. */
const MAX_TEST_DELAY_MS = 10_000;

/**
 * Development only: an `x-test-delay: <ms>` request header holds the API
 * response for that long, so the browser suite can leave a page while a
 * mutation is in flight. Any other stage ignores the header.
 */
const withTestDelay =
  (respond: ApiHandler): ApiHandler =>
  async (request, context) => {
    if (config.stage === "development") {
      const delay = Number(request.headers.get("x-test-delay"));
      if (Number.isFinite(delay) && delay > 0) {
        await new Promise((resolve) =>
          setTimeout(resolve, Math.min(delay, MAX_TEST_DELAY_MS)),
        );
      }
    }
    return respond(request, context);
  };

// Share the memo map so the services above are built once, not per layer.
const api = makeWebHandler(ServicesLive, {
  memoMap: runtime.memoMap,
  rateLimiter: RateLimiterLive,
});

/**
 * Fetch-style handler for everything under /api/* (except /api/auth) and
 * /.well-known/forge-health. A direct API request comes without `context`:
 * the security middleware then builds the request's `RequestContext` itself.
 * The SSR path passes `renderContext(...)` so every call of one render
 * shares it.
 */
export const apiHandler: ApiHandler = flushed(withTestDelay(api.handler));

/**
 * The per-request services for one incoming page request: its
 * `RequestContext`, built once and handed to every in-process API dispatch
 * the render makes (see lib/api.ts).
 */
export const renderContext = (
  headers: Headers,
): Promise<Context.Context<never>> =>
  runtime
    .runPromise(RequestContext.make(headers))
    .then((context) => Context.make(RequestContext, context));

/** better-auth's handler for /api/auth/*. */
export const authHandler: (request: Request) => Promise<Response> = flushed(
  (request: Request) =>
    runtime.runPromise(Effect.flatMap(Auth, (auth) => auth.handler(request))),
);

/**
 * The rate-limit gate for better-auth's own routes, which are not HttpApi
 * endpoints and so never reach the contract's `RateLimit` middleware
 * (`routes/api/auth.$.ts` decides which scope a request counts against).
 * Answers the 429 to send, or `null` to let the request through.
 */
export const guardAuthRequest = (
  scope: RateLimitScope,
  request: Request,
): Promise<Response | null> =>
  runtime.runPromise(
    consumeForRequest(scope, request).pipe(
      Effect.as<Response | null>(null),
      Effect.catchTag("RateLimited", (refused) =>
        Effect.succeed(rateLimitedResponse(refused)),
      ),
    ),
  );

/**
 * Who is uploading or downloading, read the same way every other route reads
 * its caller: better-auth's session for the request's cookies, validated
 * against the `user` row (`RequestContext`). A request without one gets a 401
 * from the handler; the user's id is what namespaces their object keys, so a
 * caller can neither overwrite nor read another's file.
 */
const storageIdentity = (request: Request): Promise<{ id: string } | null> =>
  runtime.runPromise(
    RequestContext.make(request.headers).pipe(
      Effect.flatMap((context) => context.session),
      Effect.map((session) =>
        session === null ? null : { id: session.user.id },
      ),
    ),
  );

/**
 * The two halves of src/routes/api.storage.$.ts. Built here because
 * `env.BUCKET` is a binding and this is the module that reads bindings; the
 * policy and the composition are in ./storage.
 */
const storage = createStorageHandlers(env.BUCKET, storageIdentity);

export const storageUploadHandler: (request: Request) => Promise<Response> =
  flushed(storage.upload);

export const storageDownloadHandler: (request: Request) => Promise<Response> =
  flushed(storage.download);

/**
 * The Stripe webhook ledger, bound to this isolate's runtime. The route is
 * not an Effect handler (it is a raw fetch handler), so the two effects are
 * run here rather than threaded through it.
 */
export const stripeWebhookEvents: StripeWebhookLedger = {
  claim: (event) =>
    runtime.runPromise(
      Effect.flatMap(WebhookEvents, (events) => events.claim(event)),
    ),
  complete: (id) =>
    runtime.runPromise(
      Effect.flatMap(WebhookEvents, (events) => events.complete(id)),
    ),
};

/** better-auth's server API, for the sign-out server function (src/server/actions.ts). */
export const authApi = () =>
  runtime.runPromise(Effect.map(Auth, (auth) => auth.instance.api));
