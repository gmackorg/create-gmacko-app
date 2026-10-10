import { Effect } from "effect";
import { decodeDatetime } from "../codecs.js";
import { err } from "../errors.js";
import { findTerminalFact } from "./facts.js";
const prefix = "@forgegraph/foundation/entitlement/_/";
function quantity(input) { return { quantity: input.quantity ?? null, unit: input.unit ?? null }; }
/** Business rights and duties; never an authorization decision or consumption ledger. */
export class Entitlements {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    call(operation, input, ctx) { return this.engine.call(prefix + operation, input, ctx); }
    issue(input, ctx) {
        return this.call("Entitlement.create", { ...input, ...quantity(input), validUntil: input.validUntil ?? null, predecessor: null, recordedBy: ctx.actor }, ctx);
    }
    recordObligation(input, ctx) {
        return this.call("Obligation.create", { ...input, ...quantity(input), dueAt: input.dueAt ?? null, recordedBy: ctx.actor }, ctx);
    }
    revoke(entitlement, effectiveAt, reason, ctx) {
        return this.call("EntitlementEnd.create", { entitlement, kind: "Revoked", effectiveAt, reason, recordedBy: ctx.actor }, ctx);
    }
    expire(entitlement, reason, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const grant = yield* self.call("Entitlement.get", { id: entitlement }, ctx);
            if (grant.validUntil == null)
                return yield* Effect.fail(err("ValidationFailed", "An unbounded entitlement has no expiry instant"));
            return yield* self.call("EntitlementEnd.create", { entitlement, kind: "Expired", effectiveAt: grant.validUntil, reason, recordedBy: ctx.actor }, ctx);
        });
    }
    /** An independently issued successor, not reactivation. Revoking a predecessor does
     * not cancel successors. The unique predecessor reference arbitrates concurrent renewal. */
    renew(entitlement, input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const old = yield* self.call("Entitlement.get", { id: entitlement }, ctx);
            return yield* self.call("Entitlement.create", { holder: old.holder, right: old.right, scope: old.scope, quantity: input.quantity ?? old.quantity, unit: old.unit, validFrom: input.validFrom, validUntil: input.validUntil ?? null, predecessor: entitlement, recordedBy: ctx.actor, reason: input.reason }, ctx);
        });
    }
    endObligation(obligation, kind, effectiveAt, reason, ctx) {
        return this.call("ObligationEnd.create", { obligation, kind, effectiveAt, recordedBy: ctx.actor, reason }, ctx);
    }
    obligationAt(obligation, at, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const instant = yield* parseInstant(at);
            const row = yield* self.call("Obligation.get", { id: obligation }, ctx);
            yield* self.engine.call("@forgegraph/foundation/party/_/Party.get", { id: row.obligatedParty }, ctx);
            const end = yield* findTerminalFact(self.engine, prefix + "ObligationEnd", "obligation", row.id, ctx);
            const state = instant < Date.parse(String(row.incurredAt)) ? "NotIncurred" : end && instant >= Date.parse(String(end.effectiveAt)) ? end.kind : row.dueAt != null && instant >= Date.parse(String(row.dueAt)) ? "Overdue" : "Open";
            return { obligation: row, state };
        });
    }
    listEffectiveRights(holder, scope, at, ctx, page = {}) {
        const self = this;
        return Effect.gen(function* () {
            const instant = yield* parseInstant(at);
            yield* self.engine.call("@forgegraph/foundation/party/_/Party.get", { id: holder }, ctx);
            yield* self.call("EntitlementScope.get", { id: scope }, ctx);
            const rows = yield* self.call("Entitlement.list.byHolderScope", { params: { holder, scope }, ...page }, ctx);
            const items = [];
            for (const row of rows.items) {
                if (instant < Date.parse(String(row.validFrom)) || row.validUntil != null && instant >= Date.parse(String(row.validUntil)))
                    continue;
                const end = yield* findTerminalFact(self.engine, prefix + "EntitlementEnd", "entitlement", row.id, ctx);
                if (end && instant >= Date.parse(String(end.effectiveAt)))
                    continue;
                yield* self.call("RightDefinition.get", { id: row.right }, ctx);
                items.push({ entitlement: String(row.id), holder, scope, right: String(row.right), quantity: row.quantity == null ? null : String(row.quantity), unit: row.unit == null ? null : String(row.unit) });
            }
            return { items, next: rows.next };
        });
    }
}
function parseInstant(at) {
    return Effect.try({ try: () => Date.parse(decodeDatetime(at)), catch: () => err("ValidationFailed", "Invalid business-fact query instant") });
}
/** Caller supplies authorized tenant-scoped Party representation and entitlement facts.
 * Independent policy decides; reevaluate every request so unchanged records cannot cache
 * an allow across revocation or validity boundaries. Never recursively read through this bridge. */
export function entitlementPipAuthorizer(base, read) {
    return {
        get epoch() { return base.epoch; }, knownObligations: base.knownObligations,
        requirements: () => [], liveAttributes: true, rowFilterFor: () => null,
        decide: request => Effect.gen(function* () { const attributes = yield* read(request); return yield* base.decide({ ...request, attributes }); }),
    };
}
