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
import { createHmac } from "node:crypto";
import { err } from "./errors.js";
import { Storage } from "./services.js";
export const SUPPRESSION_KIND = "_forge/suppression";
export const SUPPRESSION_CLASS = { class: "data.identity.pseudonymous", handling: "restricted", personal: "potentially", identifiability: "linkable-with-key" };
export class Suppression {
    engine;
    key;
    constructor(engine, key = "forge-suppression-key") {
        this.engine = engine;
        this.key = key;
    }
    /** Keyed pseudonym for a subject identity; deterministic per tenant, never the raw id. */
    token(tenant, resource, id) {
        return createHmac("sha256", `${this.key}|${tenant}`).update(`${resource}|${id}`).digest("hex").slice(0, 32);
    }
    docId(tenant, resource, id) {
        return this.token(tenant, resource, id);
    }
    record(tenant, subject, e) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            const token = self.token(tenant, subject.resource, subject.id);
            const entry = { token, resource: subject.resource, kind: e.kind, epoch: e.epoch, at: e.at, reason: e.reason, classification: SUPPRESSION_CLASS };
            const existing = yield* storage.getDocument(tenant, SUPPRESSION_KIND, token);
            yield* storage.putDocument(tenant, SUPPRESSION_KIND, token, entry, existing?.["_version"] ?? null);
            return entry;
        });
    }
    lookup(tenant, resource, id) {
        const self = this;
        return Effect.gen(function* () {
            const doc = yield* (yield* Storage).getDocument(tenant, SUPPRESSION_KIND, self.docId(tenant, resource, id));
            return doc ? doc : null;
        });
    }
    /** The subject a record belongs to: itself for `@subject(kind)`, the referenced record for `@subject(from: field)`. */
    subjectOf(r, record) {
        const s = r.decorators.subject;
        if (!s)
            return null;
        if (s.binding === "kind")
            return { resource: r.id, id: String(record["id"]) };
        const field = r.fields.find((f) => f.name === s.field);
        const target = field && field.type.base.kind === "reference" ? field.type.base.resource : null;
        const value = record[s.field];
        return target && typeof value === "string" ? { resource: target, id: value } : null;
    }
    /** Refuse a commit that would create or revive data of a suppressed subject. */
    guard(r, kind, after, ctx) {
        const self = this;
        if (kind !== "create" && kind !== "restore" && kind !== "update")
            return Effect.void;
        const subject = self.subjectOf(r, after);
        if (!subject)
            return Effect.void;
        return self.lookup(ctx.tenant, subject.resource, subject.id).pipe(Effect.flatMap((e) => (e ? Effect.fail(err("Suppressed", `${r.name}: the subject was ${e.kind} at epoch ${e.epoch}; ${kind === "update" ? "updates" : "recreation"} under a suppressed subject are refused`, { fields: [{ path: "subject", code: "Suppressed", message: `token ${e.token} (${SUPPRESSION_CLASS.class})` }] })) : Effect.void)));
    }
    /** Audit view: the token with its classification, never the raw identity. */
    audit(tenant, resource, id) {
        return this.lookup(tenant, resource, id).pipe(Effect.map((e) => (e ? { token: e.token, classification: e.classification, kind: e.kind, epoch: e.epoch, at: e.at } : null)));
    }
}
