/**
 * M11 runtime governance: subject location and content inspection verdicts.
 *
 * Subjects (plan §7.2, PAR-093/094): a subject is a record of a resource
 * declared `@subject(kind)`; records of resources declared `@subject(from:
 * field)` belong to the subject their field references. Location walks only
 * those declared bindings through bounded `list by` access paths, reports
 * linked subjects (a guardian shared by two students) with how many other
 * records share them, and never proposes a cascade.
 *
 * Inspection (plan §7.3, PAR-097): a verdict binds a sealed digest and
 * generation. Absent verdict = `pending`; a detector failure = `review-
 * required`; `quarantined` blocks every read; only `allowed` clears content.
 * Nothing a detector reports can lower a declared classification.
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import type { CallContext, Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import type { Resource } from "./model.js";
import { type RuntimeServices } from "./services.js";
export type InspectionState = "pending" | "allowed" | "quarantined" | "review-required";
export interface Inspection {
    state: InspectionState;
    generation: number;
    digest?: string;
    detector?: string;
    detail?: string;
    at?: string;
}
export declare class Governance {
    private readonly engine;
    /** Edition 2027 packages serve no content before an `allowed` verdict; 2026 serves `pending` (never blocked states). */
    private strict;
    constructor(engine: Engine);
    get strictInspection(): boolean;
    set strictInspection(v: boolean);
    handle(action: string, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    private subjectKind;
    locate(body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    private docId;
    /** Current verdict for the record's sealed generation; absence is `pending`. */
    status(r: Resource, id: string, generation: number, ctx: CallContext): Effect.Effect<Inspection, ForgeError, RuntimeServices>;
    /** Gate applied by every content read (download, export). */
    checkReadable(r: Resource, id: string, generation: number, ctx: CallContext): Effect.Effect<void, ForgeError, RuntimeServices>;
    private inspect;
}
