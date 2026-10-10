import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
/** Explainable business assignments. Eligibility snapshots are revalidated, never
 * authorization grants; capacity and accepted publication share one transaction. */
export declare class Routing {
    private readonly engine;
    private readonly allocation;
    private readonly availability;
    private readonly qualifications;
    constructor(engine: Engine);
    private call;
    private clean;
    private now;
    private facts;
    private eligible;
    evaluate(input: {
        request: string;
        resource: string;
        participant?: string;
        rank: number;
        rationale: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    offer(candidate: string, expiresAt: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    accept(offer: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    closeOffer(offer: string, outcome: "declined" | "expired", reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private assignment;
    /** Authorized publication/history inspection, including released assignments. */
    inspect(assignment: string, ctx: CallContext): Effect.Effect<{
        row: Wire;
        offer: Wire;
        facts: {
            candidate: Wire;
            request: Wire;
            resource: Wire;
        };
        released: Wire | null;
    }, ForgeError, never>;
    consume(assignment: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    release(assignment: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    attachExecution(assignment: string, fulfillment: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
