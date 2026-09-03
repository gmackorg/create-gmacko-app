/**
 * The only module in the repo allowed to import `cloudflare:workers`.
 *
 * Bindings enter Effect here, as services, and every request shares the
 * ManagedRuntime built below. Module scope does no I/O.
 */
import { env, waitUntil } from "cloudflare:workers";
import { Database } from "@gmacko/db";
import { FileSystem, Layer, ManagedRuntime, Path, Schema } from "effect";
import { Etag, HttpPlatform, HttpRouter } from "effect/unstable/http";

import { ApiLive, AppConfig, Stage } from "./api";
import { Background } from "./background";

/**
 * Deliberately fails fast at module load: a misconfigured STAGE should stop
 * the Worker from starting (visible in the deploy) rather than surface as a
 * 500 on the first request.
 */
const stage = Schema.decodeUnknownSync(Stage)(env.STAGE);

const AppConfigLive = Layer.succeed(AppConfig)({ stage });

/**
 * HttpApiBuilder.layer needs the file-serving services even though this API
 * never touches a file; workerd has no filesystem, so they are no-ops.
 */
const PlatformLive = Layer.mergeAll(
  HttpPlatform.layer.pipe(Layer.provideMerge(FileSystem.layerNoop({}))),
  Path.layer,
  Etag.layer,
);

/** Every service the app needs, independent of HTTP. Shared by all handlers. */
const ServicesLive = Layer.mergeAll(
  AppConfigLive,
  Background.layer(waitUntil),
  // D1 bindings are safe to hold at module scope; one client per isolate.
  Database.layer(env.DB),
  PlatformLive,
);

/** One runtime per isolate; `scheduled` and queue handlers run effects here. */
export const runtime = ManagedRuntime.make(ServicesLive);

const webHandler = HttpRouter.toWebHandler(
  ApiLive.pipe(Layer.provideMerge(ServicesLive)),
  // Share the memo map so the services above are built once, not per layer.
  { memoMap: runtime.memoMap },
);

/** Fetch-style handler for everything under /api/*. */
export const apiHandler: (request: Request) => Promise<Response> =
  webHandler.handler;
