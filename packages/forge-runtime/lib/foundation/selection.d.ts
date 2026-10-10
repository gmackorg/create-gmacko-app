import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
/** Explicit, bounded scored shortlists. Domain applications own submissions and
 * scoring policy; Decision owns the vote and Agreement owns accepted terms. */
export declare class Selection {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private clean;
    private now;
    private solicitation;
    private submission;
    submit(input: {
        solicitation: string;
        key: string;
        participant: string;
        evaluationSet: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private score;
    private validateScore;
    scoreSubmission(submission: string, finish: string, score: string, rationale: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    shortlist(solicitation: string, decisionCase: string, scores: readonly string[], ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private readShortlist;
    award(shortlist: string, agreement: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    inspectAward(solicitation: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
