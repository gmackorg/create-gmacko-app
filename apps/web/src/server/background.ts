import { Context, Effect, Layer } from "effect";

/**
 * Runs an effect after the response has been sent, without blocking it.
 *
 * On Workers this is backed by `waitUntil` from `cloudflare:workers`, which
 * keeps the isolate alive until the promise settles. The service exists so
 * that nothing outside `runtime.ts` has to know about the platform.
 *
 * The effect runs with the caller's context, so it keeps the fiber's services,
 * logger and tracer. That context also includes the request scope, which
 * closes as soon as the response is sent: a background effect must not
 * acquire request-scoped resources (a `Scope`-bound handle, a streamed body,
 * a per-request client). Use module-scoped services from the runtime instead.
 *
 * Failures and defects never propagate; the full cause is logged.
 */
export class Background extends Context.Service<
  Background,
  {
    readonly run: <A, E, R>(
      effect: Effect.Effect<A, E, R>,
    ) => Effect.Effect<void, never, R>;
  }
>()("@gmacko/web/Background") {
  /** Builds the service from a platform `waitUntil`. */
  static layer = (waitUntil: (promise: Promise<unknown>) => void) =>
    Layer.succeed(Background)({
      run: <A, E, R>(effect: Effect.Effect<A, E, R>) =>
        Effect.context<R>().pipe(
          Effect.map((context) => {
            waitUntil(
              Effect.runPromiseWith(context)(
                Effect.ignoreCause(effect, {
                  log: true,
                  message: "background effect failed",
                }),
              ),
            );
          }),
        ),
    });
}
