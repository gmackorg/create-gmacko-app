import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
/** Future-harm scenarios remain distinct from observed findings and completed work. */
export declare class Risks {
    private readonly engine;
    constructor(engine: Engine);
    assess(input: {
        risk: string;
        predecessor?: string;
        likelihood: string;
        impact: string;
        confidence: string;
        evaluation: string;
        support: string;
        assessedAt: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    accept(assessment: string, decisionCase: string, acceptOption: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    acceptance(id: string, acceptOption: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
