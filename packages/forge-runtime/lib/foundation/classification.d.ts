import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
/** Historical meaning never floats through a supersession. The caller explicitly
 * chooses a successor revision after inspecting lifecycle at its effective time. */
export declare class Classification {
    private readonly engine;
    constructor(engine: Engine);
    status(concept: string, at: string, ctx: CallContext): Effect.Effect<{
        state: "active";
        replacement: null;
    } | {
        state: "retired" | "superseded";
        replacement: string | null;
    }, import("../errors.js").ForgeError, never>;
    resolveAssignment(assignment: string, ctx: CallContext): Effect.Effect<any, import("../errors.js").ForgeError, never>;
}
