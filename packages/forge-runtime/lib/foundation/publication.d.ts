import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export type QualificationPolicy = "None" | "EvaluationCompleted" | "DecisionApproved" | "Both";
export interface RegisterCandidate {
    series: string;
    version: string;
    specification: string;
    artifact: string;
    policy: QualificationPolicy;
    evaluationDefinition?: string;
    decisionCase?: string;
    approvedOption?: string;
    support?: string;
}
export type PublicationStatus = "Published" | "Deprecated" | "Retired";
export interface PublicationState {
    events: Wire[];
    releases: Map<string, {
        release: Wire;
        status: PublicationStatus;
    }>;
    channels: Map<string, string>;
}
/** One bounded journal orders every publication, promotion and retirement in a series. */
export declare class Publications {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private find;
    private evidence;
    register(input: RegisterCandidate, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    attachEvaluation(candidate: string, run: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private validate;
    qualify(candidateId: string, input: {
        evaluation?: string;
        decision?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    candidatePhase(id: string, ctx: CallContext): Effect.Effect<"Proposed" | "Qualifying" | "Qualified" | "Rejected", ForgeError>;
    private releaseRecord;
    state(series: string, ctx: CallContext): Effect.Effect<PublicationState, ForgeError>;
    private append;
    publish(candidateId: string, channel: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    promote(release: string, channel: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    transition(release: string, kind: "Deprecated" | "Retired", reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    release(id: string, ctx: CallContext): Effect.Effect<{
        release: Wire;
        status: PublicationStatus;
    } | null, ForgeError>;
    channel(id: string, ctx: CallContext): Effect.Effect<{
        channel: Wire;
        release: Wire | null;
        status: PublicationStatus | null;
    }, ForgeError>;
    audience(promotion: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
