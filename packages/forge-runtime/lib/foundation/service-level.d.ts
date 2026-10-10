import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export interface ServiceState {
    instance: Wire;
    objective: Wire;
    events: Wire[];
    elapsedMinutes: number;
    dueAt: string | null;
    paused: boolean;
    finished: Wire | null;
    breached: boolean;
    verdict: "Running" | "Paused" | "AtRisk" | "Met" | "Breached";
}
export declare class ServiceLevels {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private find;
    start(input: {
        key: string;
        objective: string;
        agreement: string;
        right: string;
        fulfillment: string;
        startedAt: string;
        horizon: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    state(instanceId: string, at: string, ctx: CallContext): Effect.Effect<ServiceState, ForgeError>;
    pause(instance: string, at: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    resume(instance: string, at: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    private clockEvent;
    assess(instance: string, at: string, evaluation: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    breach(instance: string, at: string, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
    remedy(breach: string, input: {
        obligation?: string;
        fulfillment?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
