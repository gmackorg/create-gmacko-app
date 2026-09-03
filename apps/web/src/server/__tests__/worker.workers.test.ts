/**
 * `makeWorker` (src/server/make-worker.ts), on workerd: Sentry's
 * `withSentry` captures what `fetch` and `scheduled` throw and flushes on
 * `waitUntil`; `scheduled` hands the telemetry flush to `waitUntil` after
 * its effect, success or failure; without a DSN the handlers run unchanged.
 * The Start server entry cannot load under pool-workers (it needs the
 * Cloudflare Vite plugin), so the parts are stubs and worker.ts is the
 * one-line composition of the real ones.
 */
import { Sentry, sentryWorkerOptions } from "@gmacko/monitoring/web/server";
import { describe, expect, it } from "vitest";

import { makeWorker, type WorkerParts } from "../make-worker";

const env = { STAGE: "development" } as unknown as Cloudflare.Env;

/** An `ExecutionContext` that remembers what was handed to `waitUntil`. */
const context = () => {
  const promises: Promise<unknown>[] = [];
  const ctx = {
    waitUntil: (promise: Promise<unknown>) => {
      promises.push(promise);
    },
    passThroughOnException: () => {},
    props: {},
  } as unknown as ExecutionContext;
  return {
    ctx,
    promises,
    settle: () => Promise.allSettled(promises),
  };
};

/** Sentry options whose transport keeps every envelope in `sent`. */
const sentryTo = (sent: string[]): Sentry.CloudflareOptions => ({
  ...sentryWorkerOptions({
    dsn: "https://public@o1.ingest.sentry.io/1",
    environment: "test",
    release: "0.0.0-test",
  }),
  transport: (options) =>
    Sentry.createTransport(options, async (request) => {
      sent.push(String(request.body));
      return { statusCode: 200 };
    }),
});

const parts = (
  overrides: Partial<WorkerParts<Cloudflare.Env>> = {},
): WorkerParts<Cloudflare.Env> & { readonly order: string[] } => {
  const order: string[] = [];
  return {
    order,
    fetch: async (request) => {
      if (new URL(request.url).pathname === "/boom") throw new Error("boom");
      return new Response("ok");
    },
    scheduled: async (controller) => {
      order.push(`tick ${controller.cron}`);
    },
    flush: async () => {
      order.push("flush");
    },
    sentry: () => undefined,
    ...overrides,
  };
};

/** `fetch`'s parameter carries the incoming `cf` properties; a plain Request is cast to it. */
const request = (url: string) =>
  new Request(url) as unknown as Request<unknown, IncomingRequestCfProperties>;

const controller = (cron = "0 3 * * *"): ScheduledController => ({
  cron,
  scheduledTime: Date.now(),
  noRetry: () => {},
});

describe("makeWorker", () => {
  it("passes fetch through, with or without a DSN", async () => {
    const sent: string[] = [];
    for (const sentry of [() => undefined, () => sentryTo(sent)]) {
      const worker = makeWorker(parts({ sentry }));
      const { ctx, settle } = context();
      const response = await worker.fetch?.(
        request("https://app.test/"),
        env,
        ctx,
      );
      expect(response?.status).toBe(200);
      await expect(response?.text()).resolves.toBe("ok");
      await settle();
    }
    expect(sent).toHaveLength(0);
  });

  it("captures what fetch throws and flushes it on waitUntil, then rethrows", async () => {
    const sent: string[] = [];
    const worker = makeWorker(parts({ sentry: () => sentryTo(sent) }));
    const { ctx, promises, settle } = context();
    await expect(
      worker.fetch?.(request("https://app.test/boom"), env, ctx),
    ).rejects.toThrow("boom");
    expect(promises.length).toBeGreaterThan(0);
    await settle();
    const envelope = sent.join("\n");
    expect(envelope).toContain('"type":"event"');
    expect(envelope).toContain("boom");
    expect(envelope).toContain('"environment":"test"');
    expect(envelope).toContain('"release":"0.0.0-test"');
  });

  it("scheduled runs the tick, then hands the telemetry flush to waitUntil", async () => {
    const p = parts();
    const worker = makeWorker(p);
    const { ctx, promises, settle } = context();
    await worker.scheduled?.(controller("*/5 * * * *"), env, ctx);
    // The flush is on waitUntil, not awaited by the handler.
    expect(promises.length).toBeGreaterThan(0);
    await settle();
    expect(p.order).toEqual(["tick */5 * * * *", "flush"]);
  });

  it("scheduled still flushes when the tick fails, and Sentry sees the failure", async () => {
    const sent: string[] = [];
    const p = parts({
      scheduled: async () => {
        throw new Error("cron broke");
      },
      sentry: () => sentryTo(sent),
    });
    const worker = makeWorker(p);
    const { ctx, settle } = context();
    await expect(worker.scheduled?.(controller(), env, ctx)).rejects.toThrow(
      "cron broke",
    );
    await settle();
    expect(p.order).toEqual(["flush"]);
    expect(sent.join("\n")).toContain("cron broke");
  });
});
