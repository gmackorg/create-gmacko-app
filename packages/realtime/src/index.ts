import { integrations } from "@gmacko/config";
import { createLogger } from "@gmacko/logging";

const log = createLogger({ module: "realtime" });

let redisClient: import("ioredis").default | null = null;
let redisInitPromise: Promise<import("ioredis").default> | null = null;
let subscriberClient: import("ioredis").default | null = null;
let subscriberInitPromise: Promise<import("ioredis").default> | null = null;
const queues: import("bullmq").Queue[] = [];
const workers: import("bullmq").Worker[] = [];

export interface RedisConfig {
  url?: string;
  host?: string;
  port?: number;
  password?: string;
  db?: number;
}

function getRedisUrl(): string | undefined {
  return process.env.REDIS_URL;
}

async function createRedisClient(
  config: RedisConfig = {},
): Promise<import("ioredis").default> {
  const { default: Redis } = await import("ioredis");
  const url = config.url ?? getRedisUrl();
  if (url) {
    return new Redis(url, { maxRetriesPerRequest: null });
  }
  return new Redis({
    host: config.host ?? "localhost",
    port: config.port ?? 6379,
    password: config.password,
    db: config.db ?? 0,
    maxRetriesPerRequest: null,
  });
}

export async function initRedis(
  config: RedisConfig = {},
): Promise<import("ioredis").default | null> {
  if (!integrations.realtime.enabled) {
    log.debug("redis initialization skipped (integration disabled)");
    return null;
  }

  if (!redisInitPromise) {
    redisInitPromise = createRedisClient(config);
    redisInitPromise.catch(() => {
      redisInitPromise = null;
    });
  }
  redisClient = await redisInitPromise;
  return redisClient;
}

export function getRedis(): import("ioredis").default | null {
  if (!integrations.realtime.enabled) return null;
  return redisClient;
}

// ---------------------------------------------------------------------------
// The published message envelope
// ---------------------------------------------------------------------------

/** A JSON value, as `JSON.parse` produces it and `publish` serialises it. */
export type JsonValue =
  | string
  | number
  | boolean
  | null
  | Array<JsonValue>
  | { readonly [key: string]: JsonValue };

/** The payload an event carries: a JSON object, keyed by field name. */
export type RealtimePayload = { readonly [key: string]: JsonValue };

/** The envelope `publish` writes and `subscribe` reads back. */
export interface RealtimeMessage {
  readonly event: string;
  readonly data: RealtimePayload;
}

/** What `subscribe` hands the caller for each message on its channel. */
export type RealtimeHandler = (event: string, data: RealtimePayload) => void;

/**
 * Whether a JSON value is the string one. `String(x) === x` holds for a
 * primitive string and for nothing else: boxing a number, a boolean, `null`
 * or an object yields its text, which is never identical to the value.
 */
const isJsonString = (value: JsonValue): value is string =>
  String(value) === value;

/** The object member of a JSON value: not absent, not `null`, not an array. */
const asPayload = (value: JsonValue | undefined): RealtimePayload | null => {
  if (value === null || value === undefined) return null;
  if (Array.isArray(value)) return null;
  if (!(value instanceof Object)) return null;
  return value;
};

/**
 * The `{ event, data }` envelope in a parsed message, or `null` when the
 * value is not one — a missing or non-string `event`, or a `data` that is not
 * a JSON object.
 */
export function readRealtimeMessage(value: JsonValue): RealtimeMessage | null {
  const envelope = asPayload(value);
  if (envelope === null) return null;
  const event = envelope.event;
  const data = asPayload(envelope.data);
  if (event === undefined || !isJsonString(event) || data === null) return null;
  return { event, data };
}

// ---------------------------------------------------------------------------
// Subscribing
// ---------------------------------------------------------------------------

/** The raw `(channel, message)` callback a pub/sub client emits. */
export type RealtimeMessageListener = (
  channel: string,
  message: string,
) => void;

/**
 * The pub/sub surface `subscribeOn` drives. `redisSubscriber` adapts an
 * ioredis connection to it; a test drives it with an in-memory implementation
 * instead of a live Redis.
 */
export interface RealtimeSubscriber {
  subscribe(channel: string): Promise<void>;
  unsubscribe(channel: string): Promise<void>;
  on(listener: RealtimeMessageListener): void;
  off(listener: RealtimeMessageListener): void;
}

/** How many live subscriptions each subscriber holds per channel. */
const refCountsBySubscriber = new WeakMap<
  RealtimeSubscriber,
  Map<string, number>
>();

const refCountsOf = (subscriber: RealtimeSubscriber): Map<string, number> => {
  const existing = refCountsBySubscriber.get(subscriber);
  if (existing !== undefined) return existing;
  const counts = new Map<string, number>();
  refCountsBySubscriber.set(subscriber, counts);
  return counts;
};

/** An ioredis connection as a `RealtimeSubscriber`. */
const redisSubscriber = (
  client: import("ioredis").default,
): RealtimeSubscriber => ({
  subscribe: async (channel) => {
    await client.subscribe(channel);
  },
  unsubscribe: async (channel) => {
    await client.unsubscribe(channel);
  },
  on: (listener) => {
    client.on("message", listener);
  },
  off: (listener) => {
    client.off("message", listener);
  },
});

export async function publish(
  channel: string,
  event: string,
  data: RealtimePayload,
): Promise<boolean> {
  const client = getRedis();
  if (!client) {
    log.debug({ event }, "publish skipped (integration disabled)");
    return false;
  }

  await client.publish(channel, JSON.stringify({ event, data }));
  return true;
}

/**
 * Route one channel of `subscriber` to `handler`, dropping messages from
 * other channels and messages that are not a `{ event, data }` envelope. The
 * subscriber is unsubscribed when its last handler for the channel is
 * released. `subscribe` supplies the process-wide ioredis subscriber; a test
 * supplies its own.
 */
export async function subscribeOn(
  subscriber: RealtimeSubscriber,
  channel: string,
  handler: RealtimeHandler,
): Promise<() => Promise<void>> {
  const refCounts = refCountsOf(subscriber);
  const refCount = refCounts.get(channel) ?? 0;
  refCounts.set(channel, refCount + 1);
  if (refCount === 0) {
    await subscriber.subscribe(channel);
  }

  const listener: RealtimeMessageListener = (ch, raw) => {
    if (ch !== channel) return;
    let parsed: JsonValue;
    try {
      parsed = JSON.parse(raw);
    } catch {
      log.warn({ channel }, "failed to parse redis message");
      return;
    }
    const message = readRealtimeMessage(parsed);
    if (message === null) {
      log.warn({ channel }, "invalid redis message shape");
      return;
    }
    handler(message.event, message.data);
  };

  subscriber.on(listener);

  return async () => {
    subscriber.off(listener);
    const current = refCounts.get(channel) ?? 1;
    if (current <= 1) {
      refCounts.delete(channel);
      await subscriber.unsubscribe(channel);
    } else {
      refCounts.set(channel, current - 1);
    }
  };
}

export async function subscribe(
  channel: string,
  handler: RealtimeHandler,
): Promise<() => Promise<void>> {
  if (!integrations.realtime.enabled) {
    log.debug("subscribe skipped (integration disabled)");
    return async () => {};
  }

  if (!subscriberInitPromise) {
    subscriberInitPromise = createRedisClient();
    subscriberInitPromise.catch(() => {
      subscriberInitPromise = null;
    });
  }
  subscriberClient = await subscriberInitPromise;

  return subscribeOn(redisSubscriber(subscriberClient), channel, handler);
}

export type { Job, Queue, Worker } from "bullmq";

export async function createQueue(
  name: string,
  config: RedisConfig = {},
): Promise<import("bullmq").Queue | null> {
  if (!integrations.realtime.enabled) {
    log.debug("queue creation skipped (integration disabled)");
    return null;
  }

  const { Queue } = await import("bullmq");
  const connection = await initRedis(config);
  if (!connection) return null;

  const queue = new Queue(name, { connection });
  queues.push(queue);
  return queue;
}

export async function createWorker<T = unknown>(
  name: string,
  processor: (job: import("bullmq").Job<T>) => Promise<void>,
  config: RedisConfig = {},
): Promise<import("bullmq").Worker<T> | null> {
  if (!integrations.realtime.enabled) {
    log.debug("worker creation skipped (integration disabled)");
    return null;
  }

  const { Worker } = await import("bullmq");
  const connection = await initRedis(config);
  if (!connection) return null;

  const worker = new Worker<T>(name, processor, { connection });
  workers.push(worker);
  return worker;
}

export async function shutdown(): Promise<void> {
  await Promise.all(workers.map((w) => w.close()));
  await Promise.all(queues.map((q) => q.close()));
  workers.length = 0;
  queues.length = 0;
  await subscriberClient?.quit();
  await redisClient?.quit();
  redisClient = null;
  redisInitPromise = null;
  subscriberClient = null;
  subscriberInitPromise = null;
}
