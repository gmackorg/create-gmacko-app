import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
export interface RoleVocabulary<Role extends string> {
    readonly namespace: string;
    readonly roles: readonly Role[];
}
/** participant is a Party record ID; membership does not own business identity. */
export interface ParticipationFact {
    participation: string;
    participant: string;
    role: string;
    participationSet: string;
}
export interface ParticipationPage {
    items: ParticipationFact[];
    next: string | null;
}
/** Facts only: membership never implies authorization. Domain wrappers own the vocabulary. */
export declare class Participations<Role extends string> {
    private readonly engine;
    private readonly namespace;
    private readonly roles;
    constructor(engine: Engine, vocabulary: RoleVocabulary<Role>);
    private call;
    registerRole(role: Role, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    add(input: {
        participationSet: string;
        participant: string;
        role: Role;
        validFrom: string;
        validUntil?: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    end(participation: string, effectiveAt: string, reason: string, ctx: CallContext, revoked?: boolean): Effect.Effect<Wire, ForgeError, never>;
    revoke(participation: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    listAt(participationSet: string, at: string, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<ParticipationPage, ForgeError>;
}
