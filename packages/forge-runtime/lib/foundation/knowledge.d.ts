import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export interface KnowledgeAccess {
    entitlement: string;
    participation: string;
}
export interface CreateKnowledgeRevision {
    item: string;
    specification: string;
    content: string;
    classifications: readonly string[];
    assessmentDefinition: string;
    previous?: string;
}
/** Exact edition facts; user-facing access combines entitlement, audience and independent Engine policy. */
export declare class Knowledge {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    createRevision(input: CreateKnowledgeRevision, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    meanings(revisionId: string, ctx: CallContext): Effect.Effect<Wire[], ForgeError>;
    publish(revision: string, audience: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    history(editionId: string, ctx: CallContext): Effect.Effect<{
        edition: Wire;
        revision: Wire;
        meanings: Wire[];
        status: "Published" | "Deprecated" | "Retired";
    }, ForgeError>;
    resolve(editionId: string, access: KnowledgeAccess, ctx: CallContext): Effect.Effect<{
        edition: Wire;
        revision: Wire;
        meanings: Wire[];
        status: "Published" | "Deprecated" | "Retired";
    }, ForgeError>;
    download(edition: string, access: KnowledgeAccess, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    feedback(edition: string, run: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    finishFeedback(feedbackId: string, finishId: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
