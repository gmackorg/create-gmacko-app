/**
 * Changesets (plan §9, §12): propose -> preview -> approve -> commit. The
 * changeset is a document; every operation inside it goes through the same
 * planFor() pipeline as a single call. Approval binds the preview's content
 * hash; commit re-plans against current state (a preview is not a lock).
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import type { CallContext, Engine } from "./engine.js";
import { ForgeError } from "./errors.js";
import { type RuntimeServices } from "./services.js";
export declare const ATOMIC_LOGICAL_LIMIT = 10;
export declare class Changesets {
    private readonly engine;
    constructor(engine: Engine);
    handle(action: string, body: Wire, ctx: CallContext): Effect.Effect<any, ForgeError, RuntimeServices>;
    private load;
    private save;
    private view;
    private propose;
    /** Plan every operation against current state; errors are per item, never thrown. */
    private planAll;
    private budget;
    private preview;
    private approve;
    private commit;
    /** Per-record commits with per-row results; safe to call again after a fault. */
    private commitResumable;
}
