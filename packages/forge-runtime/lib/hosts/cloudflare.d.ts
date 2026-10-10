import { type D1Like } from "../adapters/d1.js";
import { type R2Like } from "../adapters/r2.js";
import { Engine } from "../engine.js";
import { type AuthHost } from "../http.js";
import { type AppBundle } from "../model.js";
import type { EngineOptions } from "../engine.js";
/** Cloudflare Workflows binding surface used by the driver. */
export interface WorkflowBindingLike {
    create(opts: {
        id: string;
        params: unknown;
    }): Promise<unknown>;
    get(id: string): Promise<{
        sendEvent(e: {
            type: string;
            payload: unknown;
        }): Promise<void>;
    }>;
}
/** Durable Object namespace surface used for realtime streams. */
export interface RealtimeNamespaceLike {
    idFromName(name: string): unknown;
    get(id: unknown): {
        fetch(input: Request | string, init?: RequestInit): Promise<Response>;
    };
}
export interface WorkerEnv {
    DB: D1Like;
    /** Realtime Durable Object namespace (bundle.realtime.cloudflare.binding). */
    REALTIME?: RealtimeNamespaceLike;
    BLOBS?: R2Like;
    CURSOR_SECRET: string;
    FORGE_AUTH?: string;
    FORGE_CORS?: string;
    /** Queue producer bindings, one per logical subscription, named `Q_<SUBSCRIPTION>` (kebab -> upper snake). */
    [binding: string]: unknown;
}
export interface WorkerOptions extends EngineOptions {
    auth?: AuthHost;
}
/**
 * The Durable Object body for realtime streams (`Base` is `DurableObject` from `cloudflare:workers`).
 * Uses the WebSocket hibernation API: sockets survive the object being evicted, their subscription
 * state lives in the socket attachment, and the session protocol is the shared one.
 */
export declare function createRealtimeObject<B extends abstract new (...args: any[]) => any>(Base: B, bundle: AppBundle, options?: WorkerOptions): (abstract new (...args: any[]) => {
    [x: string]: any;
    engineFor(env: WorkerEnv): Engine;
    fetch(request: Request): Promise<Response>;
    webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void>;
    webSocketClose(ws: WebSocket, code: number): Promise<void>;
}) & B;
/**
 * The WorkflowEntrypoint body for one Forge workflow: `run` loops the portable executor with
 * durable `step.do` calls, `step.sleep` for sleeps, and `step.waitForEvent` (bounded by the wait's
 * deadline) for waits. `Base` is `WorkflowEntrypoint` from `cloudflare:workers`, passed in so this
 * module stays importable outside the Workers runtime.
 */
export declare function createWorkflowEntrypoint<B extends abstract new (...args: any[]) => any>(Base: B, bundle: AppBundle, options?: WorkerOptions): (abstract new (...args: any[]) => {
    [x: string]: any;
    run(event: {
        payload: {
            tenant: string;
            id: string;
        };
    }, step: {
        do<T>(name: string, fn: () => Promise<T>): Promise<T>;
        sleep(name: string, ms: number): Promise<void>;
        waitForEvent(name: string, opts: {
            type: string;
            timeout?: string | number;
        }): Promise<unknown>;
    }): Promise<{
        status: string;
        dueAt?: string;
    } | null>;
}) & B;
export declare function createWorker(bundle: AppBundle, options?: WorkerOptions): {
    /** One driver step for the Workflows entrypoint: advance and report where the instance parked. */
    advance(env: WorkerEnv, tenant: string, id: string): Promise<{
        status: string;
        dueAt?: string;
    }>;
    /** Cron trigger: the durable outbox sweep (plan §14: waitUntil nudges are not a delivery guarantee). */
    scheduled(event: {
        cron?: string;
        scheduledTime?: number;
    } | unknown, env: WorkerEnv, ctx: {
        waitUntil(p: Promise<unknown>): void;
    }): Promise<void>;
    /** Queue consumer: every message is a forge envelope for exactly one subscription (the queue's). */
    queue(batch: {
        queue: string;
        messages: {
            body: unknown;
            ack(): void;
            retry(): void;
        }[];
    }, env: WorkerEnv): Promise<void>;
    fetch(request: Request, env: WorkerEnv, ctx?: {
        waitUntil(p: Promise<unknown>): void;
    }): Promise<Response>;
};
