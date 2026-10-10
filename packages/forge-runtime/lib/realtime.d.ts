/**
 * Realtime profile (plan §19). Channels bound with `@websocket(path)` are
 * streams: their publications reach the stream ledger through the same
 * outbox as every other consumer (logical subscription `realtime:<Channel>`),
 * receive a per-(tenant, stream) sequence number there, are kept in a bounded
 * replay window, and are then pushed to live sessions by the provider hub.
 *
 * What the profile promises: text JSON frames capped at `maxFrameBytes`,
 * increasing sequence numbers per stream, replay from a position within the
 * window (an explicit `gap` otherwise), at-least-once delivery. What it does
 * not: preserved connection identity or exactly-once through disconnects —
 * clients resume by position, never by connection.
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import type { Envelope, Transport } from "./dispatch.js";
import type { Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import { type RuntimeServices } from "./services.js";
export declare const MAX_FRAME_BYTES = 65536;
export declare const DEFAULT_REPLAY_DEPTH = 256;
export type EventFrame = {
    type: "event";
    stream: string;
    seq: number;
    message: string;
    messageId: string;
    payload: Wire;
    at: string;
};
export type RealtimeFrame = EventFrame | {
    type: "hello";
    stream: string;
    latest: number;
} | {
    type: "resumed";
    stream: string;
    after: number;
    replayed: number;
    gap: boolean;
    latest: number;
} | {
    type: "error";
    code: string;
    detail: string;
} | {
    type: "pong";
};
export type InboundFrame = {
    type: "subscribe";
    stream: string;
} | {
    type: "resume";
    stream: string;
    after: number;
} | {
    type: "ping";
};
/** Provider fan-out: Durable Object sockets on Cloudflare, API Gateway connections on AWS. */
export interface RealtimeHub {
    broadcast(tenant: string, channel: string, frame: EventFrame): Promise<void>;
}
export declare class Realtime {
    private readonly engine;
    hub: RealtimeHub | null;
    replayDepth: number;
    constructor(engine: Engine);
    streams(): {
        channel: string;
        name: string;
        path: string;
    }[];
    stream(channel: string): {
        channel: string;
        name: string;
        path: string;
    } | null;
    streamByPath(path: string): {
        channel: string;
        name: string;
        path: string;
    } | null;
    /** Assign the next sequence number and keep the frame in the bounded replay window (idempotent per messageId). */
    append(tenant: string, channel: string, env: Envelope): Effect.Effect<EventFrame | null, ForgeError, RuntimeServices>;
    /** Frames after `after` within the window; `gap` when older frames were dropped. */
    replay(tenant: string, channel: string, after: number): Effect.Effect<{
        frames: EventFrame[];
        gap: boolean;
        latest: number;
    }, ForgeError, RuntimeServices>;
    /** `realtime:<Channel>` logical subscriptions on every bound channel. */
    subscriptions(base?: Record<string, string[]>): Record<string, string[]>;
    /** In-process transport: sequence in the ledger, then hand to the provider hub. */
    transport(): Transport;
}
/**
 * Browsers cannot set headers on a WebSocket upgrade, so the auth host sees a
 * request whose `x-forge-*` headers are lifted from the query string
 * (`?tenant=&actor=` for development header auth; real hosts pass a token).
 */
export declare function upgradeAuthRequest(url: URL, headers: Headers): Request;
/**
 * The shared session protocol (used verbatim by the Durable Object and the
 * API Gateway handler): validates inbound frames, tracks subscriptions, and
 * answers with the frames to send back.
 */
export declare class SessionProtocol {
    private readonly engine;
    readonly tenant: string;
    private readonly subs;
    constructor(engine: Engine, tenant: string);
    subscribed(stream: string): boolean;
    accepts(tenant: string, stream: string): boolean;
    /** Restore subscriptions (hibernated sockets, connection registries). */
    restore(streams: string[]): void;
    streams(): string[];
    handle(text: string): Promise<RealtimeFrame[]>;
}
