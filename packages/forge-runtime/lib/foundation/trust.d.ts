import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export declare class Trust {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private support;
    signal(id: string, at: string, ctx: CallContext): Effect.Effect<{
        signal: any;
        correction: Wire | null;
        dispute: Wire | null;
        resolution: Wire | null;
        usable: boolean;
    }, ForgeError, never>;
    review(id: string, at: string, ctx: CallContext): Effect.Effect<{
        review: any;
        dimension: any;
        members: {
            member: Wire;
            signal: Wire;
            usable: boolean;
        }[];
        usable: boolean;
    }, ForgeError, never>;
    open(input: {
        subject: string;
        dimension: string;
        windowFrom: string;
        windowUntil: string;
        evaluations: string;
        signals: {
            signal: string;
            rationale: string;
        }[];
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    assess(review: string, input: {
        finish: string;
        score: string;
        confidence: string;
        explanation: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    inspect(assessment: string, at: string, ctx: CallContext): Effect.Effect<{
        usable: boolean;
        review: any;
        dimension: any;
        members: {
            member: Wire;
            signal: Wire;
            usable: boolean;
        }[];
        assessment: any;
    }, ForgeError, never>;
    linkRisk(assessment: string, trust: string, rationale: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
}
