/**
 * `ApiLive`: every handler group of `AppApi`, every service they use, and
 * every middleware the contract declares (credentials and roles from
 * @gmacko/auth, the rate limit and the endpoint boundary from here). The
 * app supplies `Database | AppConfig | Background | Auth`; the rest is
 * derived.
 */
import { SecurityLive } from "@gmacko/auth/middleware";
import { AuthSecurityConfig } from "@gmacko/auth/security-config";
import type { Auth } from "@gmacko/auth/service";
import type { Database } from "@gmacko/db";
import { AppApi } from "@gmacko/domain";
import { Effect, FileSystem, Layer, Path } from "effect";
import { Etag, HttpPlatform } from "effect/unstable/http";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { AdminHandlers } from "./admin/handlers";
import { AuthHandlers } from "./auth/handlers";
import type { Background } from "./background";
import { EndpointBoundaryLive } from "./boundary";
import { AppConfig } from "./config";
import { HealthHandlers } from "./health/handlers";
import { PostsHandlers } from "./posts/handlers";
import { RateLimiter, RateLimitLive } from "./rate-limit";
import { SettingsHandlers } from "./settings/handlers";

/** What the credential middlewares need from `AppConfig`. */
export const AuthSecurityConfigLive: Layer.Layer<
  AuthSecurityConfig,
  never,
  AppConfig
> = Layer.effect(AuthSecurityConfig)(
  Effect.map(AppConfig, (config) => ({
    allowedOrigins: config.allowedOrigins,
    stage: config.stage,
  })),
);

/**
 * `HttpApiBuilder.layer` needs the file-serving services even though this
 * API never touches a file; workerd has no filesystem, so they are no-ops.
 */
const PlatformLive = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provideMerge(FileSystem.layerNoop({}))),
  Path.layer,
  Etag.layer,
);

const Handlers = Layer.mergeAll(
  HealthHandlers,
  AuthHandlers,
  PostsHandlers,
  SettingsHandlers,
  AdminHandlers,
);

/** The services the app provides; everything else is built here. */
export type AppServices = Database | AppConfig | Background | Auth;

export interface ApiLiveOptions {
  /**
   * Defaults to the in-memory limiter with `defaultRateLimits`. May require
   * `Database` (`RateLimiter.layerD1`, `RateLimiter.layerCloudflare`), which
   * the app provides along with the rest of `AppServices`.
   */
  readonly rateLimiter?: Layer.Layer<RateLimiter, never, Database> | undefined;
}

/**
 * The whole API as a layer over `AppServices`, minus the router (which
 * `HttpRouter.toWebHandler` adds; see handler.ts). The type is left to
 * inference: it carries the router's phantom request requirement.
 */
export const makeApiLive = (options?: ApiLiveOptions) =>
  HttpApiBuilder.layer(AppApi).pipe(
    Layer.provide(Handlers),
    Layer.provide(
      Layer.mergeAll(SecurityLive, EndpointBoundaryLive, RateLimitLive),
    ),
    Layer.provide(options?.rateLimiter ?? RateLimiter.layerMemory()),
    Layer.provide(AuthSecurityConfigLive),
    Layer.provide(PlatformLive),
  );

export const ApiLive = makeApiLive();
