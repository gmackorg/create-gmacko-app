import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export type EvaluationPhase = "Planned" | "Running" | "Completed" | "Failed" | "Cancelled";
/** Immutable run, start and terminal facts. Operational completion is not a business verdict. */
export declare class Evaluations {
    private readonly engine;
    constructor(engine: Engine);
    create(input: {
        evaluationSet: string;
        definition: string;
        executor: string;
        parent?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** History stays readable, but quarantined legacy results cannot confer authority. */
    result(finish: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private requireUnquarantined;
    start(run: string, startedAt: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    finish(run: string, outcome: Exclude<EvaluationPhase, 'Planned' | 'Running'>, finishedAt: string, reason: string, ctx: CallContext, support?: string): Effect.Effect<Wire, ForgeError>;
    phase(run: string, ctx: CallContext): Effect.Effect<EvaluationPhase, ForgeError>;
}
