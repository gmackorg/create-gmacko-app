/**
 * `flushTelemetry` is what every request hands to `waitUntil`, so it must
 * settle on its own: a hung exporter is cut off after five seconds and a
 * failing one is logged and ignored. And `Observability.layer`'s logging
 * `base` is additive: the app adds `stage` without losing `service` and
 * `version`.
 */
import type { LogRecord } from "@gmacko/logging";
import { Effect, Fiber, Layer, ManagedRuntime } from "effect";
import { TestClock } from "effect/testing";
import { describe, expect, it } from "vitest";

import { flushTelemetry, Observability, OtlpExporter } from "../index";

/** A `Flusher` whose `flush` is the given effect (nothing registers on it). */
const flusher = (flush: Effect.Effect<void>) =>
  Layer.succeed(OtlpExporter.Flusher)({
    flush,
    register: () => Effect.void,
  });

describe("flushTelemetry", () => {
  it("gives up on a hung flush after five seconds", async () => {
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(flusher(Effect.never), TestClock.layer()),
    );
    try {
      const outcome = await runtime.runPromise(
        Effect.gen(function* () {
          const fiber = yield* Effect.forkChild(flushTelemetry);
          yield* TestClock.adjust("4 seconds");
          const early = fiber.pollUnsafe();
          yield* TestClock.adjust("2 seconds");
          yield* Fiber.join(fiber);
          return { early };
        }),
      );
      expect(outcome.early).toBeUndefined();
    } finally {
      await runtime.dispose();
    }
  });

  it("ignores a failing flush and logs it", async () => {
    const lines: LogRecord[] = [];
    // The dying flusher goes on top of the layer's own (no-op) one.
    const runtime = ManagedRuntime.make(
      Layer.mergeAll(
        Observability.layer({
          endpoint: undefined,
          serviceName: "t",
          serviceVersion: "0",
          logging: { sink: (_line, record) => lines.push(record) },
        }),
        flusher(Effect.die(new Error("collector down"))),
      ),
    );
    try {
      await expect(runtime.runPromise(flushTelemetry)).resolves.toBeUndefined();
    } finally {
      await runtime.dispose();
    }
    expect(lines.some((l) => l.msg.includes("telemetry flush failed"))).toBe(
      true,
    );
    expect(
      lines.find((l) => l.msg.includes("telemetry flush failed"))?.cause,
    ).toContain("collector down");
  });
});

describe("Observability.layer logging.base", () => {
  it("keeps service and version when the app adds its own base fields", async () => {
    const lines: LogRecord[] = [];
    const runtime = ManagedRuntime.make(
      Observability.layer({
        endpoint: undefined,
        serviceName: "gmacko-web",
        serviceVersion: "1.2.3",
        logging: {
          base: { stage: "staging" },
          sink: (_line, record) => lines.push(record),
        },
      }),
    );
    try {
      await runtime.runPromise(Effect.logInfo("hello"));
    } finally {
      await runtime.dispose();
    }
    expect(lines[0]?.fields).toMatchObject({
      service: "gmacko-web",
      version: "1.2.3",
      stage: "staging",
    });
  });
});
