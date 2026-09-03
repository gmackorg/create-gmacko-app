import { Context, Effect, Layer, Schema } from "effect";
import {
  HttpApi,
  HttpApiBuilder,
  HttpApiEndpoint,
  HttpApiGroup,
} from "effect/unstable/httpapi";

import { Background } from "./background";

export const Stage = Schema.Literals([
  "development",
  "preview",
  "staging",
  "production",
]);
export type Stage = typeof Stage.Type;

/**
 * Validated, typed view of the Worker bindings. Built once in `runtime.ts`
 * from `cloudflare:workers` env; nothing else reads bindings directly.
 */
export class AppConfig extends Context.Service<
  AppConfig,
  { readonly stage: Stage }
>()("@gmacko/web/AppConfig") {}

export const LiveStatus = Schema.Struct({
  status: Schema.Literal("ok"),
  stage: Stage,
});

export class HealthApi extends HttpApiGroup.make("health")
  .add(HttpApiEndpoint.get("live", "/live", { success: LiveStatus }))
  .prefix("/health") {}

export class GmackoApi extends HttpApi.make("gmacko")
  .add(HealthApi)
  .prefix("/api") {}

export const HealthHandlers = HttpApiBuilder.group(
  GmackoApi,
  "health",
  (handlers) =>
    Effect.gen(function* () {
      const config = yield* AppConfig;
      const background = yield* Background;
      return handlers.handle("live", () =>
        Effect.gen(function* () {
          // Spike A evidence for waitUntil: this completes after the response.
          yield* background.run(
            Effect.sleep("200 millis").pipe(
              Effect.andThen(
                Effect.log(
                  "background effect completed after /api/health/live",
                ),
              ),
            ),
          );
          return { status: "ok" as const, stage: config.stage };
        }),
      );
    }),
);

/** Every HttpApi handler group, minus the platform services (AppConfig, Background). */
export const ApiLive = HttpApiBuilder.layer(GmackoApi).pipe(
  Layer.provide(HealthHandlers),
);
