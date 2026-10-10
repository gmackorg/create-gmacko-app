import { Effect } from "effect";
import type { Wire } from "../decode.js";
import { type Engine, type CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
export type DecisionRule = "Single" | "First" | "Quorum" | "Unanimous" | "ChooseOne" | "Ranked";
export interface OpenDecision {
    participationSet: string;
    eligibilityAt: string;
    electors: readonly string[];
    rule: DecisionRule;
    threshold?: number;
    options: readonly string[];
    deadline: string;
    support?: string;
    evaluation?: string;
    reconsideration?: string;
}
export interface DecisionState {
    decisionCase: Wire;
    events: Wire[];
    responses: Wire[];
    options: Wire[];
    terminal: Wire | null;
    outcome: Wire | null;
}
/** A bounded append-only command journal is the serialization guard. Candidates have no
 * authority until selected by a journal event; only state() returns a validated outcome. */
export declare class Decisions {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private find;
    private support;
    open(input: OpenDecision, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private electorate;
    state(decisionCase: string, ctx: CallContext): Effect.Effect<DecisionState, ForgeError>;
    private append;
    respond(decisionCase: string, voter: string, ranking: readonly number[], ctx: CallContext, support?: string): Effect.Effect<Wire, ForgeError>;
    withdraw(decisionCase: string, response: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    finalize(decisionCase: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    expire(decisionCase: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
