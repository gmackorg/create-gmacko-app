import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
/** Publication accepts only sealed write-once content. Schema rules also enforce
 * digest/type/size equality, including callers of the underlying create operation. */
export declare class Artifacts {
    private readonly engine;
    constructor(engine: Engine);
    publish(input: {
        artifact: string;
        content: string;
        digest: string;
        specificationPin?: string;
        realization?: string;
        components?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** Build the immutable chain before publication; a revision pins its exact head.
     * Appending another node cannot alter a published revision's membership. */
    component(name: string, revision: string, next: string | null, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    components(head: string, ctx: CallContext): Effect.Effect<{
        name: string;
        revision: string;
    }[], ForgeError>;
    download(revision: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
