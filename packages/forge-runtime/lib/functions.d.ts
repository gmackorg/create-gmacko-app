/**
 * Implemented functions (plan §5.4, §8). The application supplies bodies with
 * defineFunction(); the runtime constructs a FunctionContext exposing exactly
 * the declared dependencies. Publications are staged and committed with the
 * function's next mutation (or in a final outbox-only commit), never sent
 * directly.
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import { canonicalize } from "./decode.js";
import { type CallContext, type Engine } from "./engine.js";
import { ForgeError } from "./errors.js";
import type { FunctionDecl } from "./model.js";
import { type RuntimeServices } from "./services.js";
import { SubscriptionDelivery } from "./subscription-delivery.js";
import type { Envelope } from "./dispatch.js";
export type ExternalResult = {
    ok: true;
    value: any;
} | {
    ok: false;
    code: string;
    detail?: string;
};
export type ExternalBinding = (input: unknown, ctx: CallContext) => Promise<ExternalResult>;
export interface ResourceReader {
    get(id: string): Effect.Effect<Wire, ForgeError>;
    find(query: string, params: Wire): Effect.Effect<Wire, ForgeError>;
    list(query: string, params: Wire, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<Wire, ForgeError>;
}
export interface ResourceWriter extends ResourceReader {
    create(input: Wire): Effect.Effect<Wire, ForgeError>;
    update(id: string, expectedVersion: number, patch: Wire): Effect.Effect<Wire, ForgeError>;
    delete(id: string, expectedVersion: number): Effect.Effect<Wire, ForgeError>;
}
export interface FunctionContext {
    readonly input: unknown;
    readonly ctx: CallContext;
    /** Declared resource capabilities, by resource name. Capability decides which methods exist. */
    readonly resources: Record<string, ResourceWriter>;
    /** Declared transitions: transitions.Order.submit(id, expectedVersion, input). */
    readonly transitions: Record<string, Record<string, (id: string, expectedVersion: number, input: Wire) => Effect.Effect<Wire, ForgeError>>>;
    /** Declared external callables, by stable id. */
    external(id: string, input: unknown): Effect.Effect<ExternalResult, ForgeError>;
    /** Stage a declared message. Delivered with the function's commit. */
    send(channel: string, message: string, payload: Wire): Effect.Effect<void, ForgeError>;
    /** Fail with a declared domain error. */
    fail(name: string, detail?: string): Effect.Effect<never, ForgeError>;
}
export interface FunctionImpl {
    id: string;
    body: (deps: FunctionContext) => Effect.Effect<Wire | void, ForgeError, never>;
}
export declare function defineFunction(id: string, body: (deps: FunctionContext) => Effect.Effect<Wire | void, ForgeError, never>): FunctionImpl;
export declare class Functions {
    private readonly engine;
    private readonly externals;
    private readonly impls;
    constructor(engine: Engine, impls: FunctionImpl[], externals: Record<string, ExternalBinding>);
    has(id: string): boolean;
    invoke(decl: FunctionDecl, input: unknown, ctx: CallContext, delivery?: SubscriptionDelivery): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    private context;
    private commitOutboxOnly;
    /** Subscription consumer: claim, execute, then atomically complete with the handler writes. */
    consume(subscription: string, env: Envelope): Promise<"processed" | "duplicate" | "unknown-subscription">;
}
export { canonicalize };
