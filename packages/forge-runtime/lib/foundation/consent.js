import { Effect } from "effect";
import { findTerminalFact } from "./facts.js";
import { decodeDatetime } from "../codecs.js";
import { err } from "../errors.js";
const prefix = "@forgegraph/foundation/consent/_/";
/**
 * Consent facts and the bitemporal question they exist to answer.
 *
 * `effectiveAt` is the only interesting operation here. A decision made last Tuesday has to be
 * explainable with what was known last Tuesday: a withdrawal recorded on Friday, backdated to
 * Monday, must not make Tuesday's decision retroactively wrong, and must still stop Saturday's.
 * So a grant counts only when it was both in force at `validAt` and already recorded by
 * `knownAt`, and a disposition suppresses it under exactly the same two tests.
 *
 * This is a bounded interpretation built from ordinary fields, not an L0 temporal facet.
 * ConceptIR #75 is what would make valid and knowledge time a language-level axis; until then
 * the convention lives in this package and the query that reads it lives here.
 *
 * Nothing here authorizes anything. A policy engine may read this as one input; a null result
 * means no permission was recorded, which is not the same as a denial.
 */
export class Consent {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    call(operation, input, ctx) {
        return this.engine.call(prefix + operation, input, ctx);
    }
    grant(input, ctx) {
        return this.call("ConsentGrant.create", {
            subject: input.subject, purpose: input.purpose, activity: input.activity, scope: input.scope,
            grantedTo: input.grantedTo ?? null, basis: input.basis ?? null,
            conditions: input.conditions ?? null,
            validFrom: input.validFrom, validUntil: input.validUntil ?? null,
            recordedAt: input.recordedAt,
        }, ctx);
    }
    evidence(grant, captured, ctx) {
        return this.call("ConsentEvidence.create", {
            grant, capturedAt: captured.capturedAt, method: captured.method, provenance: captured.provenance,
        }, ctx);
    }
    withdraw(grant, when, reason, ctx) {
        return this.call("ConsentDisposition.create", {
            grant, replacement: null, withdrawn: true,
            effectiveAt: when.effectiveAt, recordedAt: when.recordedAt, reason,
        }, ctx);
    }
    supersede(grant, replacement, when, reason, ctx) {
        return this.call("ConsentDisposition.create", {
            grant, replacement, withdrawn: false,
            effectiveAt: when.effectiveAt, recordedAt: when.recordedAt, reason,
        }, ctx);
    }
    /** The grant in force at `validAt` as known at `knownAt`, or null when there was none. */
    effectiveAt(selector, asOf, ctx, limit = 64) {
        const self = this;
        return Effect.gen(function* () {
            const instant = (value, label) => Effect.try({
                try: () => Date.parse(decodeDatetime(value)),
                catch: () => err("ValidationFailed", `Invalid consent ${label}`),
            });
            const validAt = yield* instant(asOf.validAt, "instant");
            const knownAt = yield* instant(asOf.knownAt ?? asOf.validAt, "knowledge instant");
            const page = yield* self.call("ConsentGrant.list.bySubjectPurposeActivityScope", {
                params: { subject: selector.subject, purpose: selector.purpose, activity: selector.activity, scope: selector.scope },
                limit,
            }, ctx);
            if (page["next"] != null)
                return yield* Effect.fail(err("BudgetExceeded", "Consent history exceeds the lookup bound; increase the limit before deciding"));
            const candidates = (page.items ?? []).filter((candidate) => {
                // Not yet recorded at knownAt: this instance could not have relied on it.
                if (Date.parse(String(candidate["recordedAt"])) > knownAt)
                    return false;
                const from = Date.parse(String(candidate["validFrom"]));
                const until = candidate["validUntil"] == null ? null : Date.parse(String(candidate["validUntil"]));
                return validAt >= from && (until === null || validAt < until);
            });
            // Ordered by validFrom ascending, so the last survivor is the one in force.
            const grant = candidates[candidates.length - 1];
            if (!grant)
                return null;
            const disposition = yield* findTerminalFact(self.engine, prefix + "ConsentDisposition", "grant", grant["id"], ctx);
            // A disposition suppresses only once it both applies and is known: a withdrawal recorded
            // after the fact cannot retroactively unmake a decision that predates knowing about it.
            if (disposition &&
                Date.parse(String(disposition["recordedAt"])) <= knownAt &&
                Date.parse(String(disposition["effectiveAt"])) <= validAt)
                return null;
            const evidence = yield* findTerminalFact(self.engine, prefix + "ConsentEvidence", "grant", grant["id"], ctx);
            return {
                grant: String(grant["id"]),
                validFrom: String(grant["validFrom"]),
                recordedAt: String(grant["recordedAt"]),
                evidenced: evidence != null,
            };
        });
    }
    listBySubject(subject, ctx, page = {}) {
        return this.call("ConsentGrant.list.bySubject", { params: { subject }, ...page }, ctx);
    }
}
