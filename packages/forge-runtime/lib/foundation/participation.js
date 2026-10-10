import { Effect } from "effect";
import { findTerminalFact } from "./facts.js";
import { decodeDatetime } from "../codecs.js";
import { err } from "../errors.js";
const prefix = "@forgegraph/foundation/participation/_/";
/** Facts only: membership never implies authorization. Domain wrappers own the vocabulary. */
export class Participations {
    engine;
    namespace;
    roles;
    constructor(engine, vocabulary) {
        this.engine = engine;
        this.namespace = vocabulary.namespace.trim().toLowerCase();
        if (!this.namespace || !vocabulary.roles.length || vocabulary.roles.some(r => !r || r.trim() !== r) || new Set(vocabulary.roles).size !== vocabulary.roles.length)
            throw new Error("Invalid participation role vocabulary");
        this.roles = new Set(vocabulary.roles);
    }
    call(op, input, ctx) { return this.engine.call(prefix + op, input, ctx); }
    registerRole(role, ctx) {
        if (!this.roles.has(role))
            return Effect.fail(err("ValidationFailed", "Role is outside the declared vocabulary"));
        return this.call("ParticipationRole.create", { namespace: this.namespace, name: role }, ctx);
    }
    add(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            if (!self.roles.has(input.role))
                return yield* Effect.fail(err("ValidationFailed", "Role is outside the declared vocabulary"));
            const role = yield* self.call("ParticipationRole.find.byNamespaceName", { params: { namespace: self.namespace, name: input.role } }, ctx);
            return yield* self.call("Participation.create", {
                participationSet: input.participationSet, participant: input.participant, role: role.id,
                validFrom: input.validFrom, validUntil: input.validUntil ?? null, reason: input.reason, recordedBy: ctx.actor,
            }, ctx);
        });
    }
    end(participation, effectiveAt, reason, ctx, revoked = false) {
        return this.call("ParticipationEnd.create", { participation, effectiveAt, reason, recordedBy: ctx.actor, revoked }, ctx);
    }
    revoke(participation, effectiveAt, reason, ctx) { return this.end(participation, effectiveAt, reason, ctx, true); }
    listAt(participationSet, at, ctx, page = {}) {
        const self = this;
        return Effect.gen(function* () {
            const instant = yield* Effect.try({ try: () => Date.parse(decodeDatetime(at)), catch: () => err("ValidationFailed", "Invalid participation lookup instant") });
            const records = yield* self.call("Participation.list.byParticipationSet", { params: { participationSet }, ...page }, ctx);
            const items = [];
            for (const row of records.items) {
                if (instant < Date.parse(String(row.validFrom)) || row.validUntil != null && instant >= Date.parse(String(row.validUntil)))
                    continue;
                const role = yield* self.call("ParticipationRole.get", { id: row.role }, ctx);
                if (role.namespace !== self.namespace || !self.roles.has(String(role.name)))
                    continue;
                const end = yield* findTerminalFact(self.engine, prefix + "ParticipationEnd", "participation", row.id, ctx);
                if (end && instant >= Date.parse(String(end.effectiveAt)))
                    continue;
                items.push({ participation: String(row.id), participant: String(row.participant), role: String(role.name), participationSet });
            }
            // Preserve the storage cursor even for empty filtered pages; callers must exhaust it.
            return { items, next: records.next };
        });
    }
}
