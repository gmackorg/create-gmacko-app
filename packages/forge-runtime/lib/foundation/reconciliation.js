import { Evaluations } from "./evaluation.js";
import { Effect } from 'effect';
import { err } from '../errors.js';
import { Storage } from '../services.js';
import { Evidence } from './evidence.js';
const p = '@forgegraph/foundation/reconciliation/_/';
export class Reconciliations {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    attempt(id, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const attempt = yield* self.engine.call(p + 'ReconciliationAttempt.get', { id }, ctx);
            const observation = yield* self.engine.call(p + 'Observation.get', { id: attempt.observation }, ctx);
            yield* new Evaluations(self.engine).result(String(observation.finish), ctx);
            return attempt;
        });
    }
    /** Prior journal events remain history; only the selected current attempt confers authority. */
    currentEvent(event, ctx) {
        const self = this;
        return Effect.gen(function* () {
            if (!event)
                return;
            if (event.attempt)
                yield* self.attempt(String(event.attempt), ctx);
            if (event.result) {
                const result = yield* self.engine.call(p + 'ReconciliationResult.get', { id: event.result }, ctx);
                yield* self.attempt(String(result.attempt), ctx);
            }
        });
    }
    /** Read complete serialized history; hidden journal entries never imply end. */
    state(scope, ctx) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.engine.call(p + 'ReconciliationScope.get', { id: scope }, ctx);
            const resource = self.engine.model.resource(p + 'ReconciliationEvent'), unique = resource.uniques.find(u => u.fields.includes('ordinal'));
            const storage = yield* Storage, events = [];
            for (let ordinal = 1; ordinal <= 128; ordinal++) {
                const values = { scope, ordinal }, key = self.engine.claimKey(resource, unique, values);
                const row = yield* storage.findUnique(ctx.tenant, resource, unique, key, values);
                if (!row)
                    break;
                events.push(yield* self.engine.call(resource.id + '.get', { id: row.id }, ctx));
            }
            const latest = events.at(-1) ?? null;
            yield* self.currentEvent(latest, ctx);
            return { events, latest };
        }).pipe(Effect.provide(self.engine.layer));
    }
    publish(scope, desired, kind, expectedPrevious, ctx, attempt, result) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.currentEvent({ attempt: attempt ?? null, result: result ?? null }, ctx);
            const revision = yield* self.engine.call(p + 'DesiredRevision.get', { id: desired }, ctx);
            yield* self.engine.call('@forgegraph/foundation/specification/_/SpecificationPin.get', { id: revision.pin }, ctx);
            const previous = expectedPrevious ? yield* self.engine.call(p + 'ReconciliationEvent.get', { id: expectedPrevious }, ctx) : null;
            return yield* self.engine.call(p + 'ReconciliationEvent.create', { scope, desired, desiredSequence: revision.sequence, kind, previous: expectedPrevious, ordinal: previous ? Number(previous.ordinal) + 1 : 1, attempt: attempt ?? null, result: result ?? null }, ctx);
        });
    }
    recordResult(attempt, outcome, support, detail, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const run = yield* self.attempt(attempt, ctx);
            const seal = yield* self.engine.call('@forgegraph/foundation/evidence/_/EvidenceSeal.get', { id: support }, ctx);
            yield* new Evidence(self.engine).sealedItems(String(seal.bundle), ctx);
            return yield* self.engine.call(p + 'ReconciliationResult.create', { attempt, desired: run.desired, outcome, support, detail }, ctx);
        });
    }
    /** Must be called again immediately before a provider operation. A local fence
     * cannot undo an external side effect; providers require their own revision fence. */
    assertCurrent(scope, desired, expectedEvent, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const state = yield* self.state(scope, ctx);
            if (state.latest?.id !== expectedEvent || state.latest.desired !== desired)
                return yield* Effect.fail(err('VersionConflict', 'Controller observed a stale desired revision or journal fence'));
        });
    }
}
