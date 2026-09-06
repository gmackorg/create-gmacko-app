import { AppApi } from "@gmacko/domain";
import { Effect, Layer } from "effect";
import { HttpApiBuilder } from "effect/unstable/httpapi";

import { Health } from "./service";

/**
 * The probes are outside the `EndpointBoundary` (see domain/api.ts), so
 * they answer only what `Health` promises: 200, or their own 503 shape.
 */
export const HealthHandlers = HttpApiBuilder.group(
  AppApi,
  "health",
  (handlers) =>
    Effect.map(Health, (health) =>
      handlers
        .handle("live", () => health.live)
        .handle("ready", () => health.ready)
        .handle("full", () => health.full)
        .handle("forge", () => health.forge),
    ),
).pipe(Layer.provide(Health.layer));
