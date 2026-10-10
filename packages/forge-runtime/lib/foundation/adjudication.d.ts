import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export interface OpenAdjudication {
    key: string;
    coverage: string;
    coverageAt: string;
    decisionCase: string;
    approvedOption: string;
    requested: string;
    unit: string;
    itemCount: number;
    support: string;
    reconsideration?: string;
}
export declare class Adjudications {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private find;
    private evidence;
    open(input: OpenAdjudication, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    item(adjudicationCase: string, ordinal: number, requested: string, evaluation: string, support: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private context;
    determine(adjudicationCase: string, authorized: string, reason: string, support: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    determination(adjudicationCase: string, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
    private verified;
    authorize(determination: string, fulfillment: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    reason(determination: string, item: string, reason: string, support: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    planSettlement(determination: string, book: string, debit: string, credit: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    settle(intentId: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    settlement(intentId: string, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
    explain(determination: string, intent: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
