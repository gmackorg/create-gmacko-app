import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
export interface UsageInput {
    stream: string;
    dimension: string;
    unit: string;
    quantity: string;
    ordinal: number;
    source: string;
    eventKey: string;
    occurredAt?: string;
    intervalStart?: string;
    intervalEnd?: string;
    replacementFor?: string;
}
export interface UsageProjection {
    stream: string;
    dimension: string;
    unit: string;
    quantity: string;
    from: string;
    until: string;
    eventIds: string[];
}
/** Exact six-decimal consumption. Projections expose a closed list of immutable
 * contributing event IDs, so replay remains stable after later corrections. */
export declare class Usage {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    ingest(input: UsageInput, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    correct(event: string, replacement: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    retract(event: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    private current;
    aggregate(stream: string, from: string, until: string, ctx: CallContext): Effect.Effect<UsageProjection, ForgeError>;
    replay(projection: UsageProjection, ctx: CallContext): Effect.Effect<string, ForgeError>;
}
