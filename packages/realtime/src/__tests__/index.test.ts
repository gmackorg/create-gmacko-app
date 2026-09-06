/**
 * Two lanes, neither of which mocks a module.
 *
 * The disabled lane calls the real entry points with the real
 * `@gmacko/config`: `integrations.realtime.enabled` is `false` in the
 * template, which is exactly the state these tests are about.
 *
 * The enabled lane drives `subscribeOn` with an in-memory `RealtimeSubscriber`
 * — the seam the ioredis connection is adapted to — so the routing and the
 * envelope validation are exercised against real code, with no Redis.
 */
import { describe, expect, it, vi } from "vitest";

import {
  createQueue,
  createWorker,
  getRedis,
  initRedis,
  publish,
  type RealtimeMessageListener,
  type RealtimePayload,
  type RealtimeSubscriber,
  readRealtimeMessage,
  shutdown,
  subscribe,
  subscribeOn,
} from "../index.js";

describe("realtime (disabled)", () => {
  it("initRedis returns null when integration disabled", async () => {
    await expect(initRedis()).resolves.toBeNull();
  });

  it("getRedis returns null when integration disabled", () => {
    expect(getRedis()).toBeNull();
  });

  it("publish returns false when integration disabled", async () => {
    await expect(
      publish("test-channel", "test-event", { foo: "bar" }),
    ).resolves.toBe(false);
  });

  it("subscribe returns a no-op cleanup function when integration disabled", async () => {
    const handler = vi.fn();
    const cleanup = await subscribe("test-channel", handler);
    expect(cleanup).toBeTypeOf("function");
    await cleanup();
    expect(handler).not.toHaveBeenCalled();
  });

  it("createQueue returns null when integration disabled", async () => {
    await expect(createQueue("test-queue")).resolves.toBeNull();
  });

  it("createWorker returns null when integration disabled", async () => {
    await expect(
      createWorker("test-worker", async () => {}),
    ).resolves.toBeNull();
  });

  it("shutdown does not throw when no clients initialized", async () => {
    await expect(shutdown()).resolves.not.toThrow();
  });
});

/** An in-memory `RealtimeSubscriber`: what a Redis subscriber connection does. */
function memorySubscriber() {
  const listeners = new Set<RealtimeMessageListener>();
  const channels = new Set<string>();
  const subscriber: RealtimeSubscriber = {
    subscribe: async (channel) => {
      channels.add(channel);
    },
    unsubscribe: async (channel) => {
      channels.delete(channel);
    },
    on: (listener) => {
      listeners.add(listener);
    },
    off: (listener) => {
      listeners.delete(listener);
    },
  };
  return {
    subscriber,
    channels,
    /** Deliver a raw message, as the connection would on `message`. */
    deliver(channel: string, message: string) {
      for (const listener of listeners) listener(channel, message);
    },
    /** Deliver a well-formed envelope. */
    emit(channel: string, event: string, data: RealtimePayload) {
      this.deliver(channel, JSON.stringify({ event, data }));
    },
  };
}

describe("readRealtimeMessage", () => {
  it("reads the { event, data } envelope publish writes", () => {
    expect(
      readRealtimeMessage({ event: "user:created", data: { id: "123" } }),
    ).toEqual({
      event: "user:created",
      data: { id: "123" },
    });
  });

  it("rejects envelopes without a string event", () => {
    expect(readRealtimeMessage({ data: { foo: "bar" } })).toBeNull();
    expect(readRealtimeMessage({ event: 7, data: {} })).toBeNull();
  });

  it("rejects a data that is not a JSON object", () => {
    expect(readRealtimeMessage({ event: "test", data: "string" })).toBeNull();
    expect(readRealtimeMessage({ event: "test", data: null })).toBeNull();
    expect(readRealtimeMessage({ event: "test", data: [1, 2] })).toBeNull();
  });

  it("rejects values that are not envelopes at all", () => {
    expect(readRealtimeMessage(null)).toBeNull();
    expect(readRealtimeMessage("just a string")).toBeNull();
    expect(readRealtimeMessage([{ event: "test", data: {} }])).toBeNull();
  });
});

describe("subscribeOn", () => {
  it("subscribes the channel on the connection", async () => {
    const redis = memorySubscriber();
    await subscribeOn(redis.subscriber, "chan", vi.fn());
    expect([...redis.channels]).toEqual(["chan"]);
  });

  it("handler is NOT called for messages with invalid shape", async () => {
    const redis = memorySubscriber();
    const handler = vi.fn();
    await subscribeOn(redis.subscriber, "chan", handler);

    redis.deliver("chan", JSON.stringify({ data: { foo: "bar" } }));
    redis.deliver("chan", JSON.stringify({ event: "test", data: "string" }));
    redis.deliver("chan", JSON.stringify({ event: "test", data: null }));
    redis.deliver("chan", "not json at all");

    expect(handler).not.toHaveBeenCalled();
  });

  it("handler SHOULD be called for valid messages", async () => {
    const redis = memorySubscriber();
    const handler = vi.fn();
    await subscribeOn(redis.subscriber, "chan", handler);

    redis.emit("chan", "user:created", { id: "123" });

    expect(handler).toHaveBeenCalledWith("user:created", { id: "123" });
  });

  it("handler should NOT receive messages from other channels", async () => {
    const redis = memorySubscriber();
    const handler = vi.fn();
    await subscribeOn(redis.subscriber, "my-channel", handler);

    redis.emit("other-channel", "test", { ok: true });
    expect(handler).not.toHaveBeenCalled();

    redis.emit("my-channel", "test", { ok: true });
    expect(handler).toHaveBeenCalledWith("test", { ok: true });
  });

  it("unsubscribes only once the last handler for a channel is released", async () => {
    const redis = memorySubscriber();
    const first = vi.fn();
    const second = vi.fn();
    const releaseFirst = await subscribeOn(redis.subscriber, "chan", first);
    const releaseSecond = await subscribeOn(redis.subscriber, "chan", second);

    await releaseFirst();
    expect([...redis.channels]).toEqual(["chan"]);
    redis.emit("chan", "test", { ok: true });
    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith("test", { ok: true });

    await releaseSecond();
    expect([...redis.channels]).toEqual([]);
  });
});
