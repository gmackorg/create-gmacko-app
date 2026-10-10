import { Effect } from "effect";
import type { Model } from "./model.js";
import type { OutboxRow, StorageAdapter } from "./services.js";
export interface Envelope {
    channel: string;
    message: string;
    tenant: string;
    opId: string;
    ordinal: number;
    /** Stable per logical message: `${opId}:${ordinal}`; consumers dedup on it. */
    messageId: string;
    payload: any;
    createdAt: string;
}
export interface Delivery {
    subscription: string;
    envelope: Envelope;
}
/** Where a delivery goes: a queue per subscription (Cloudflare Queues, SQS), or an in-process consumer. */
export interface Transport {
    readonly name: string;
    send(d: Delivery): Effect.Effect<void, Error>;
}
export interface DispatcherOptions {
    /** channel id -> logical subscription names (one durable delivery each). */
    subscriptions: Record<string, string[]>;
    leaseMs: number;
    maxAttempts: number;
    owner?: string;
    batch?: number;
}
export interface SweepReport {
    claimed: number;
    delivered: number;
    failed: number;
    dead: number;
}
export declare function envelopeOf(row: OutboxRow): Envelope;
export declare class Dispatcher {
    readonly model: Model;
    private readonly storage;
    private readonly transport;
    private readonly opts;
    private readonly owner;
    constructor(model: Model, storage: StorageAdapter, transport: Transport, opts: DispatcherOptions);
    subscriptionsFor(channel: string): string[];
    /** One pass: bounded, safe to run concurrently with other dispatchers (claims are conditional). */
    sweep(tenant: string, o: {
        now: number;
    }): Effect.Effect<SweepReport, Error>;
    dead(tenant: string): Effect.Effect<OutboxRow[], import("./errors.js").ForgeError, never>;
    redrive(tenant: string, opId: string, ordinal: number): Effect.Effect<boolean, import("./errors.js").ForgeError, never>;
    /** Wrap an opaque callback. Its effects cannot join our transaction, so a failure or crash
     * after callback intent is recorded requires reconciliation. Prefer Engine.consume for
     * declared handlers whose local writes can commit atomically with completion. */
    consumer(subscription: string, handler: (env: Envelope) => Promise<void>): (env: Envelope) => Promise<"processed" | "duplicate">;
}
