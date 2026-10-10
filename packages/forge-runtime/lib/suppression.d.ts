/**
 * Suppression ledger (FORGE-079; PAR-158/159/162). Once a subject is erased
 * or restricted, nothing may recreate its data: not a delayed event, not an
 * import, not a backup restore. The ledger is consulted on every commit that
 * would create or revive a record bound to a subject, and by the portability
 * import before a restored row becomes readable. It is retained independently
 * of business data (its own document kind, never part of an export) so a
 * restore replays the *current* suppression state.
 *
 * Identifiers are minimized: the ledger stores a keyed token
 * (HMAC-SHA256 of tenant, resource and id under the tenant's suppression key)
 * rather than the subject id. The token is still potentially linkable, so it
 * is classified `data.identity.pseudonymous`, handling `restricted`, and the
 * audit view exposes it only with that classification attached (PAR-162).
 */
import { Effect } from "effect";
import type { CallContext, Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import type { Resource } from "./model.js";
import { type RuntimeServices, type StoredRecord } from "./services.js";
export declare const SUPPRESSION_KIND = "_forge/suppression";
export declare const SUPPRESSION_CLASS: {
    readonly class: "data.identity.pseudonymous";
    readonly handling: "restricted";
    readonly personal: "potentially";
    readonly identifiability: "linkable-with-key";
};
export interface SuppressionEntry {
    token: string;
    resource: string;
    kind: "erased" | "restricted";
    /** Epoch at which the disposition took effect; events/rows from before it are refused. */
    epoch: number;
    at: string;
    reason: string;
    /** Classification travels with the token wherever it is exposed. */
    classification: typeof SUPPRESSION_CLASS;
}
export declare class Suppression {
    private readonly engine;
    private readonly key;
    constructor(engine: Engine, key?: string);
    /** Keyed pseudonym for a subject identity; deterministic per tenant, never the raw id. */
    token(tenant: string, resource: string, id: string): string;
    private docId;
    record(tenant: string, subject: {
        resource: string;
        id: string;
    }, e: {
        kind: SuppressionEntry["kind"];
        reason: string;
        at: string;
        epoch: number;
    }): Effect.Effect<SuppressionEntry, ForgeError, RuntimeServices>;
    lookup(tenant: string, resource: string, id: string): Effect.Effect<SuppressionEntry | null, ForgeError, RuntimeServices>;
    /** The subject a record belongs to: itself for `@subject(kind)`, the referenced record for `@subject(from: field)`. */
    subjectOf(r: Resource, record: Record<string, unknown>): {
        resource: string;
        id: string;
    } | null;
    /** Refuse a commit that would create or revive data of a suppressed subject. */
    guard(r: Resource, kind: string, after: StoredRecord, ctx: CallContext): Effect.Effect<void, ForgeError, RuntimeServices>;
    /** Audit view: the token with its classification, never the raw identity. */
    audit(tenant: string, resource: string, id: string): Effect.Effect<{
        token: string;
        classification: typeof SUPPRESSION_CLASS;
        kind: string;
        epoch: number;
        at: string;
    } | null, ForgeError, RuntimeServices>;
}
