import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export interface PursuitTransition {
    stage: string;
    transition?: string;
    assessment?: string;
    agreement?: string;
    effectiveAt: string;
    nextAction?: string;
    reason: string;
}
/** Pursuit is a possible outcome. Only an issued Agreement proves conversion. */
export declare class Opportunities {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private event;
    private assessment;
    state(opportunity: string, ctx: CallContext): Effect.Effect<{
        opportunity: any;
        events: Wire[];
        outcome: {};
        stage: {} | null;
    }, ForgeError, never>;
    transition(opportunity: string, input: PursuitTransition, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    assess(opportunity: string, input: {
        finish: string;
        confidence?: string;
        potentialValue?: string;
        unit?: string;
        rationale: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    linkQuote(opportunity: string, quote: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    linkSelection(opportunity: string, solicitation: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
}
