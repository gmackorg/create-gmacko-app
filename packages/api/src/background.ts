/**
 * `Background`: runs an effect after the response has been sent, without
 * blocking it. On Workers the app backs it with `waitUntil` from
 * `cloudflare:workers`, which keeps the isolate alive until the promise
 * settles; the service exists so nothing outside the app's runtime module
 * has to know about the platform.
 *
 * The effect runs with the caller's context, so it keeps the fiber's
 * services, logger and tracer. That context also includes the request scope,
 * which closes as soon as the response is sent: a background effect must not
 * acquire request-scoped resources (a `Scope`-bound handle, a streamed body,
 * a per-request client). Use module-scoped services from the runtime instead.
 *
 * Failures and defects never propagate; the full cause is logged.
 */
import { Context, Effect, Layer } from "effect";

export interface BackgroundShape {
  readonly run: <A, E, R>(
    effect: Effect.Effect<A, E, R>,
  ) => Effect.Effect<void, never, R>;
}

const swallow = <A, E, R>(effect: Effect.Effect<A, E, R>) =>
  Effect.ignoreCause(effect, {
    log: true,
    message: "background effect failed",
  });

export class Background extends Context.Service<Background, BackgroundShape>()(
  "@gmacko/api/Background",
) {
  /** Builds the service from a platform `waitUntil`. */
  static layer = (
    waitUntil: (promise: Promise<unknown>) => void,
  ): Layer.Layer<Background> =>
    Layer.succeed(Background)({
      run: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.context<R>().pipe(
          Effect.map((context) => {
            waitUntil(Effect.runPromiseWith(context)(swallow(effect)));
          }),
        ),
    });

  /**
   * Runs the effect inline, before continuing: for tests and for hosts with
   * no `waitUntil`, where "after the response" has no meaning.
   */
  static layerSync: Layer.Layer<Background> = Layer.succeed(Background)({
    run: (effect) => swallow(effect),
  });
}
