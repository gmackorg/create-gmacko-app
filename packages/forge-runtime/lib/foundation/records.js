import { Effect } from "effect";
import { err } from "../errors.js";
import { Storage } from "../services.js";
import { Evidence } from "./evidence.js";
const p = "@forgegraph/foundation/records/_/";
function check(ok, detail) { return ok ? Effect.void : Effect.fail(err("ValidationFailed", detail)); }
/** Durable decisions only. Physical archival/destruction is a separate, authorized adapter. */
export class Records {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    call(op, input, ctx) { return this.engine.call(p + op, input, ctx); }
    evidence(id, ctx) { const self = this; return Effect.gen(function* () { if (id != null) {
        const seal = yield* self.engine.call("@forgegraph/foundation/evidence/_/EvidenceSeal.get", { id }, ctx);
        yield* new Evidence(self.engine).sealedItems(String(seal.bundle), ctx);
    } }); }
    register(rule, triggeredAt, ctx, support = null) {
        const self = this;
        return Effect.gen(function* () {
            const policy = yield* self.call("RetentionRule.get", { id: rule }, ctx);
            yield* self.evidence(policy.support, ctx);
            yield* self.evidence(support, ctx);
            const start = Date.parse(triggeredAt), end = start + Number(policy.periodDays) * 86400000;
            yield* check(Number.isFinite(start) && Number.isSafeInteger(end) && Math.abs(end) <= 8640000000000000, "Invalid retention trigger or deadline");
            return yield* self.call("Record.create", { rule, trigger: policy.trigger, triggeredAt, retainUntil: new Date(end).toISOString(), support }, ctx);
        });
    }
    event(record, ordinal, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const resource = self.engine.model.resource(p + "RecordEvent"), unique = resource.uniques.find(u => u.fields.length === 2 && u.fields.includes("record") && u.fields.includes("ordinal"));
            const values = { record, ordinal };
            const row = yield* (yield* Storage).findUnique(ctx.tenant, resource, unique, self.engine.claimKey(resource, unique, values), values);
            return row ? yield* self.call("RecordEvent.get", { id: row.id }, ctx) : null;
        }).pipe(Effect.provide(self.engine.layer));
    }
    state(record, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const row = yield* self.call("Record.get", { id: record }, ctx), rule = yield* self.call("RetentionRule.get", { id: row.rule }, ctx);
            yield* self.call("RecordCategory.get", { id: rule.category }, ctx);
            yield* self.evidence(rule.support, ctx);
            yield* self.evidence(row.support, ctx);
            yield* check(Date.parse(String(row.retainUntil)) === Date.parse(String(row.triggeredAt)) + Number(rule.periodDays) * 86400000, "Record deadline does not match pinned retention rule");
            const events = [], holds = new Map();
            let disposed = false;
            for (let ordinal = 0; ordinal < 128; ordinal++) {
                const event = yield* self.event(record, ordinal, ctx);
                if (!event)
                    break;
                yield* check(!disposed && (event.previous ?? null) === (events.at(-1)?.id ?? null), "Invalid records journal chain");
                yield* self.evidence(event.support, ctx);
                if (event.kind === "Hold")
                    holds.set(String(event.id), event);
                else if (event.kind === "Release") {
                    yield* check(holds.has(String(event.hold)), "Release does not identify an active hold");
                    holds.delete(String(event.hold));
                }
                else {
                    yield* check(event.kind === "Dispose" && holds.size === 0 && Date.parse(String(event.effectiveAt)) >= Date.parse(String(row.retainUntil)), "Disposition is held or premature");
                    disposed = true;
                }
                yield* check(event.activeHolds === holds.size, "Hold count does not match journal history");
                events.push(event);
            }
            return { record: row, rule, events, holds, disposed };
        });
    }
    append(record, kind, hold, effectiveAt, reason, authority, support, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const state = yield* self.state(record, ctx);
            yield* check(!state.disposed && state.events.length < 128, "Record is disposed or journal is full");
            yield* self.evidence(support, ctx);
            if (kind === "Release")
                yield* check(state.holds.has(String(hold)), "Unknown or released hold");
            if (kind === "Dispose")
                yield* check(state.holds.size === 0, "Legal hold suspends disposition");
            return yield* self.call("RecordEvent.create", { record, ordinal: state.events.length, previous: state.events.at(-1)?.id ?? null, kind, hold, activeHolds: state.holds.size + (kind === "Hold" ? 1 : kind === "Release" ? -1 : 0), effectiveAt, reason, authority, support, recordedBy: ctx.actor }, ctx);
        });
    }
    hold(record, at, reason, authority, ctx, support = null) { return this.append(record, "Hold", null, at, reason, authority, support, ctx); }
    release(record, hold, at, reason, authority, ctx, support = null) { return this.append(record, "Release", hold, at, reason, authority, support, ctx); }
    dispose(record, at, reason, authority, ctx, support = null) { return this.append(record, "Dispose", null, at, reason, authority, support, ctx); }
}
