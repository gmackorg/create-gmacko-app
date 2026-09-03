import { Context, Effect, Layer } from "effect";

/**
 * Runs an effect after the response has been sent, without blocking it.
 *
 * On Workers this is backed by `waitUntil` from `cloudflare:workers`, which
 * keeps the isolate alive until the promise settles. The service exists so
 * that nothing outside `runtime.ts` has to know about the platform.
 */
export class Background extends Context.Service<
  Background,
  {
    readonly run: <A, E>(effect: Effect.Effect<A, E>) => Effect.Effect<void>;
  }
>()("@gmacko/web/Background") {
  /**
   * Builds the service from a platform `waitUntil`. The effect runs with the
   * caller's context so it keeps the fiber's services, logger and tracer.
   */
  static layer = (waitUntil: (promise: Promise<unknown>) => void) =>
    Layer.succeed(Background)({
      run: (effect) =>
        Effect.context<never>().pipe(
          Effect.map((context) => {
            waitUntil(Effect.runPromiseWith(context)(Effect.ignore(effect)));
          }),
        ),
    });
}
