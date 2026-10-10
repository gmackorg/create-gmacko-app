import { Effect } from 'effect';
import { decodeDatetime } from '../codecs.js';
import { err } from '../errors.js';
import { Evidence } from './evidence.js';
import { Clock } from '../services.js';
import { findTerminalFact } from './facts.js';
const p = '@forgegraph/foundation/resource-relations/_/';
/** Package-owned bitemporal interpretation, not ConceptIR #75/#77 implementation.
 * A candidate never grants a relation; one commit owns admission and predecessor end.
 * No relation implies authorization, legal title, or globally exclusive custody. */
export class ResourceRelations {
    engine;
    namespace;
    kinds;
    constructor(engine, vocabulary) {
        this.engine = engine;
        this.namespace = vocabulary.namespace.trim().toLowerCase();
        this.kinds = new Set(vocabulary.kinds);
        if (!this.namespace || !vocabulary.kinds.length || this.kinds.size !== vocabulary.kinds.length || vocabulary.kinds.some(k => !k || k.trim() !== k))
            throw new Error('Invalid resource relation vocabulary');
    }
    call(operation, input, ctx) { return this.engine.call(p + operation, input, ctx); }
    instant(value) { return Effect.try({ try: () => Date.parse(decodeDatetime(value)), catch: () => err('ValidationFailed', 'Invalid resource relation instant') }); }
    keyContext(key, ctx) { return { ...ctx, idempotencyKey: 'resource-relations:' + key }; }
    registerKind(kind, definition, ctx) {
        if (!this.kinds.has(kind))
            return Effect.fail(err('ValidationFailed', 'Kind is outside the declared vocabulary'));
        return this.call('RelationKind.create', { namespace: this.namespace, name: kind, definition }, this.keyContext('kind:' + this.namespace + ':' + kind, ctx));
    }
    validateCommit(commit, ctx) {
        const self = this;
        return Effect.gen(function* () {
            let node = commit;
            const seen = new Set();
            while (node) {
                if (seen.has(String(node.id)) || seen.size >= 128)
                    return yield* Effect.fail(err('ValidationFailed', 'Invalid or overlong relation history'));
                seen.add(String(node.id));
                const known = yield* self.instant(node.createdAt);
                yield* self.validateSource(String(node.source), known, ctx);
                if (node.current)
                    yield* self.validateCandidate(String(node.current), known, ctx);
                if (!node.priorCommit)
                    break;
                const previous = yield* self.call('RelationCommit.get', { id: node.priorCommit }, ctx);
                if ((yield* self.instant(previous.createdAt)) > known)
                    return yield* Effect.fail(err('ValidationFailed', 'Relation knowledge ancestry runs backward'));
                node = previous;
            }
        });
    }
    validateSource(id, known, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const source = yield* self.call('RelationSource.get', { id }, ctx);
            yield* self.engine.call('@forgegraph/foundation/evidence/_/EvidenceSource.get', { id: source.source }, ctx);
            const seal = yield* self.engine.call('@forgegraph/foundation/evidence/_/EvidenceSeal.get', { id: source.evidence }, ctx);
            const items = yield* new Evidence(self.engine).sealedItems(String(seal.bundle), ctx);
            if (!items.some(item => item.source === source.source && item.sourceRecord === source.sourceRecord))
                return yield* Effect.fail(err('ValidationFailed', 'Sealed evidence does not support declared source record'));
            for (const value of [source.createdAt, source.occurredAt, seal.createdAt, ...items.flatMap(item => [item.createdAt, item.observedAt])]) {
                if ((yield* self.instant(value)) > known)
                    return yield* Effect.fail(err('ValidationFailed', 'Provenance was not known or observed at relation publication'));
            }
        });
    }
    validateCandidate(id, known, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const row = yield* self.call('PartyResourceRelation.get', { id }, ctx);
            yield* self.call('ResourceSubject.get', { id: row.subject }, ctx);
            yield* self.engine.call('@forgegraph/foundation/party/_/Party.get', { id: row.party }, ctx);
            const kind = yield* self.call('RelationKind.get', { id: row.kind }, ctx);
            yield* self.engine.call('@forgegraph/foundation/specification/_/SpecificationPin.get', { id: kind.definition }, ctx);
            yield* self.call('RelationScope.get', { id: row.scope }, ctx);
            if ((yield* self.instant(row.createdAt)) > known)
                return yield* Effect.fail(err('ValidationFailed', 'Candidate was not known at relation publication'));
        });
    }
    establish(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            if (!self.kinds.has(input.kind))
                return yield* Effect.fail(err('ValidationFailed', 'Kind is outside the declared vocabulary'));
            const kind = yield* self.call('RelationKind.find.byNamespaceName', { params: { namespace: self.namespace, name: input.kind } }, ctx);
            const candidate = yield* self.call('PartyResourceRelation.create', { key: input.key, subject: input.subject, party: input.party, kind: kind.id, scope: input.scope,
                quantity: input.quantity ?? null, unit: input.unit ?? null, validFrom: input.validFrom, validUntil: input.validUntil ?? null, previous: null, depth: 1 }, self.keyContext('candidate:' + input.key, ctx));
            return yield* self.publish(input.key, null, null, String(candidate.id), input.validFrom, input.source, input.reason, ctx);
        });
    }
    publish(key, prior, priorCommit, current, effectiveAt, source, reason, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const now = yield* Effect.provide(Effect.gen(function* () { const clock = yield* Clock; return clock.now(); }), self.engine.layer);
            const known = yield* self.instant(now);
            yield* self.validateSource(source, known, ctx);
            if (current)
                yield* self.validateCandidate(current, known, ctx);
            if (priorCommit) {
                const ancestor = yield* self.call('RelationCommit.get', { id: priorCommit }, ctx);
                yield* self.validateCommit(ancestor, ctx);
                if ((yield* self.instant(ancestor.createdAt)) > known)
                    return yield* Effect.fail(err('ValidationFailed', 'Relation knowledge ancestry runs backward'));
            }
            const commit = yield* self.call('RelationCommit.create', { key, prior, priorCommit, current, effectiveAt, source, reason, recordedBy: ctx.actor }, self.keyContext('commit:' + key, ctx));
            yield* self.validateCommit(commit, ctx);
            return commit;
        });
    }
    /** Transition identity is the event key. Unique prior and current claims commit together. */
    handoff(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const prior = yield* self.call('PartyResourceRelation.get', { id: input.prior }, ctx);
            const kind = yield* self.call('RelationKind.get', { id: prior.kind }, ctx);
            if (kind.namespace !== self.namespace || !self.kinds.has(String(kind.name)))
                return yield* Effect.fail(err('ValidationFailed', 'Relation is outside the declared vocabulary'));
            const admission = yield* findTerminalFact(self.engine, p + 'RelationCommit', 'current', prior.id, ctx);
            if (!admission)
                return yield* Effect.fail(err('InvalidTransition', 'Unpublished relation cannot be handed off'));
            yield* self.validateCommit(admission, ctx);
            const candidate = yield* self.call('PartyResourceRelation.create', { key: input.key, subject: prior.subject, party: input.party, kind: prior.kind, scope: prior.scope, quantity: prior.quantity, unit: prior.unit,
                validFrom: input.effectiveAt, validUntil: prior.validUntil, previous: prior.id, depth: Number(prior.depth) + 1 }, self.keyContext('candidate:' + input.key, ctx));
            return yield* self.publish(input.key, String(prior.id), String(admission.id), String(candidate.id), input.effectiveAt, input.source, input.reason, ctx);
        });
    }
    end(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const row = yield* self.call('PartyResourceRelation.get', { id: input.relation }, ctx);
            const kind = yield* self.call('RelationKind.get', { id: row.kind }, ctx);
            if (kind.namespace !== self.namespace || !self.kinds.has(String(kind.name)))
                return yield* Effect.fail(err('ValidationFailed', 'Relation is outside the declared vocabulary'));
            const admission = yield* findTerminalFact(self.engine, p + 'RelationCommit', 'current', row.id, ctx);
            if (!admission)
                return yield* Effect.fail(err('InvalidTransition', 'Unpublished relation cannot terminate'));
            yield* self.validateCommit(admission, ctx);
            return yield* self.publish(input.key, String(row.id), String(admission.id), null, input.effectiveAt, input.source, input.reason, ctx);
        });
    }
    asOf(subject, time, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const valid = yield* self.instant(time.validAt), known = yield* self.instant(time.knownAt);
            yield* self.call('ResourceSubject.get', { id: subject }, ctx);
            const resource = self.engine.model.resource(p + 'PartyResourceRelation');
            const permission = yield* self.engine.gatekeeper.decide(p + 'PartyResourceRelation.list.bySubject', 'read', resource, ctx);
            if (permission.effect !== 'allow' || permission.rowFilter?.length)
                return yield* Effect.fail(err('NotPermitted', 'Temporal relation selection requires unfiltered relation read authority'));
            const rows = yield* self.call('PartyResourceRelation.list.bySubject', { params: { subject }, limit: 100 }, ctx);
            if (rows.next)
                return yield* Effect.fail(err('BudgetExceeded', 'Resource relation history exceeds 100 candidates'));
            const result = [];
            for (const row of rows.items) {
                const admission = yield* findTerminalFact(self.engine, p + 'RelationCommit', 'current', row.id, ctx);
                if (!admission)
                    continue;
                yield* self.validateCommit(admission, ctx);
                if ((yield* self.instant(admission.createdAt)) > known)
                    continue;
                const kind = yield* self.call('RelationKind.get', { id: row.kind }, ctx);
                if (kind.namespace !== self.namespace || !self.kinds.has(String(kind.name)))
                    continue;
                const end = yield* findTerminalFact(self.engine, p + 'RelationCommit', 'prior', row.id, ctx);
                if (end)
                    yield* self.validateCommit(end, ctx);
                const knownEnd = end && (yield* self.instant(end.createdAt)) <= known ? end : null;
                const until = knownEnd ? String(knownEnd.effectiveAt) : row.validUntil == null ? null : String(row.validUntil);
                if (valid < (yield* self.instant(row.validFrom)) || until !== null && valid >= (yield* self.instant(until)))
                    continue;
                result.push({ relation: String(row.id), party: String(row.party), kind: String(kind.name), subject, scope: String(row.scope), quantity: row.quantity == null ? null : String(row.quantity), unit: row.unit == null ? null : String(row.unit), validFrom: String(row.validFrom), validUntil: until, knownFrom: String(admission.createdAt), establishment: String(admission.id), termination: knownEnd ? String(knownEnd.id) : null });
            }
            return result.sort((a, b) => a.relation.localeCompare(b.relation));
        });
    }
}
