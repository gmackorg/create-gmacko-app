import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export interface PublishOffer {
    entry: string;
    supplier: string;
    terms: string;
    scope: string;
    validFrom: string;
    validUntil: string;
    document?: string;
    support?: string;
    evaluation?: string;
    right?: string;
    requirement?: string;
    previous?: string;
}
export interface AcceptAgreement {
    acceptanceKey: string;
    offer: string;
    customer: string;
    supplierParticipation: string;
    customerParticipation: string;
    decisionCase: string;
    approvedOption: string;
    expectedTerms: string;
    expectedDocument?: string;
    validFrom: string;
    validUntil: string;
    predecessor?: string;
    change?: "Original" | "Renewal" | "Amendment";
}
export interface AgreementState {
    agreement: Wire;
    issuance: Wire | null;
    events: Wire[];
    phase: "NotAccepted" | "PendingIssuance" | "Scheduled" | "Active" | "Expired" | "Suspended" | "Terminated";
}
/** Immutable acceptance followed by durable, idempotent issuance stages. */
export declare class AgreementCatalog {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private find;
    private evidence;
    /** Authorized immutable offer, including its evidence and completed evaluation. */
    offer(id: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    publish(input: PublishOffer, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    select(offer: string, decisionCase: string, approvedOption: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    qualify(decisionCase: string, approvedOption: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    accept(input: AcceptAgreement, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** Durable candidate only; it grants no ability to issue until a commit exists. */
    prepareAcceptance(input: AcceptAgreement, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** Recover a server-timestamped committed command under current read/write authorization. */
    acceptCommitted(input: AcceptAgreement, commitment: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private acceptRecord;
    private signers;
    private validateAgreement;
    /** Receipt keys derive from immutable acceptance identity, never from a retry's request ID.
     * A failed stage leaves acceptance inspectable and can safely resume the same stage. */
    issue(agreementId: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    state(agreementId: string, at: string, ctx: CallContext): Effect.Effect<AgreementState, ForgeError>;
    /** Agreement-aware use of rights; suspension does not rewrite independent substrate grants. */
    rightsAt(agreement: string, at: string, ctx: CallContext): Effect.Effect<Wire[], ForgeError>;
    transition(agreement: string, kind: "Suspended" | "Resumed" | "Terminated", reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
