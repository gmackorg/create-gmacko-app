import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import type { ForgeError } from "../errors.js";
/** Domain transforms own their output schema and create capability; no untyped business payload. */
export declare class Intake {
    private readonly engine;
    constructor(engine: Engine);
    submit(input: {
        form: string;
        submitter?: string;
        sourceKey: string;
        submittedAt: string;
        raw?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    validate(submission: string, finish: string, verdict: 'Accepted' | 'Rejected', reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
