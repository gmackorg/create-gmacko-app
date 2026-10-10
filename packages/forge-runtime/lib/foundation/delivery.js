import { Effect } from 'effect';
import { Evidence } from './evidence.js';
import { findTerminalFact } from './facts.js';
const p = '@forgegraph/foundation/delivery/_/';
/** All writes use authorized Engine operations; provider effects happen only after
 * a durable claim and still require provider-specific deduplication/reconciliation. */
export class Deliveries {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    create(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.engine.call(p + 'DeliveryDestination.get', { id: input.destination }, ctx);
            if (input.payload)
                yield* self.engine.call('@forgegraph/foundation/artifact/_/ArtifactRevision.get', { id: input.payload }, ctx);
            return yield* self.engine.call(p + 'DeliveryIntent.create', { ...input, payload: input.payload ?? null }, { ...ctx, idempotencyKey: ctx.idempotencyKey ?? input.key });
        });
    }
    claim(intent, choice, reason, ctx, previous) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.engine.call(p + 'DeliveryIntent.get', { id: intent }, ctx);
            const prior = previous ? yield* self.engine.call(p + 'DeliveryStep.get', { id: previous }, ctx) : null;
            const receipt = prior ? yield* findTerminalFact(self.engine, p + 'DeliveryReceipt', 'step', prior.id, ctx) : null;
            const resolution = receipt ? yield* findTerminalFact(self.engine, p + 'DeliveryResolution', 'receipt', receipt.id, ctx) : null;
            return yield* self.engine.call(p + 'DeliveryStep.create', { intent, number: prior ? Number(prior.number) + 1 : 1, choice, previous: prior?.id ?? null, receipt: receipt?.id ?? null, resolution: resolution?.id ?? null, reason }, ctx);
        });
    }
    start(step, startedAt, provider, providerKey, ctx) { return this.engine.call(p + 'DeliveryAttempt.create', { step, startedAt, provider, providerKey }, ctx); }
    receipt(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            if (input.support)
                yield* self.support(input.support, ctx);
            return yield* self.engine.call(p + 'DeliveryReceipt.create', { ...input, support: input.support ?? null }, { ...ctx, idempotencyKey: ctx.idempotencyKey ?? input.callbackKey });
        });
    }
    resolve(receipt, outcome, resolvedAt, detail, ctx, support) {
        const self = this;
        return Effect.gen(function* () {
            if (support)
                yield* self.support(support, ctx);
            return yield* self.engine.call(p + 'DeliveryResolution.create', { receipt, outcome, resolvedAt, detail, support: support ?? null }, ctx);
        });
    }
    outcome(step, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const claim = yield* self.engine.call(p + 'DeliveryStep.get', { id: step }, ctx);
            yield* self.engine.call(p + 'DeliveryIntent.get', { id: claim.intent }, ctx);
            if (claim.choice === 'Cancel')
                return 'Cancelled';
            const receipt = yield* findTerminalFact(self.engine, p + 'DeliveryReceipt', 'step', step, ctx);
            if (receipt) {
                if (receipt.support != null)
                    yield* self.support(String(receipt.support), ctx);
                const resolution = yield* findTerminalFact(self.engine, p + 'DeliveryResolution', 'receipt', receipt.id, ctx);
                if (resolution) {
                    if (resolution.support != null)
                        yield* self.support(String(resolution.support), ctx);
                    return String(resolution.outcome);
                }
                return String(receipt.outcome);
            }
            return (yield* findTerminalFact(self.engine, p + 'DeliveryAttempt', 'step', step, ctx)) ? 'Started' : 'Claimed';
        });
    }
    support(id, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const seal = yield* self.engine.call('@forgegraph/foundation/evidence/_/EvidenceSeal.get', { id }, ctx);
            yield* new Evidence(self.engine).sealedItems(String(seal.bundle), ctx);
        });
    }
}
