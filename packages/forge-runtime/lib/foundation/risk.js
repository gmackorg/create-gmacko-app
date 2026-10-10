import { Evaluations } from "./evaluation.js";
import { Effect } from 'effect';
import { err } from '../errors.js';
import { Evidence } from './evidence.js';
import { Decisions } from './decision.js';
const p = '@forgegraph/foundation/risk/_/';
/** Future-harm scenarios remain distinct from observed findings and completed work. */
export class Risks {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    assess(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.engine.call(p + 'Risk.get', { id: input.risk }, ctx);
            const prior = input.predecessor ? yield* self.engine.call(p + 'RiskAssessment.get', { id: input.predecessor }, ctx) : null;
            yield* new Evaluations(self.engine).result(String(input.evaluation), ctx);
            for (const id of [input.likelihood, input.impact])
                yield* self.engine.call(p + 'RiskLevel.get', { id }, ctx);
            const seal = yield* self.engine.call('@forgegraph/foundation/evidence/_/EvidenceSeal.get', { id: input.support }, ctx);
            yield* new Evidence(self.engine).sealedItems(String(seal.bundle), ctx);
            return yield* self.engine.call(p + 'RiskAssessment.create', { ...input, predecessor: input.predecessor ?? null, revision: prior ? Number(prior.revision) + 1 : 1 }, ctx);
        });
    }
    accept(assessment, decisionCase, acceptOption, reason, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const assessed = yield* self.engine.call(p + 'RiskAssessment.get', { id: assessment }, ctx);
            yield* new Evaluations(self.engine).result(String(assessed.evaluation), ctx);
            const state = yield* new Decisions(self.engine).state(decisionCase, ctx);
            if (!state.outcome || state.outcome.selected !== acceptOption)
                return yield* Effect.fail(err('InvalidTransition', 'Decision has not selected the designated acceptance option'));
            return yield* self.engine.call(p + 'RiskAcceptance.create', { assessment, decisionCase, outcome: state.outcome.id, reason }, ctx);
        });
    }
    acceptance(id, acceptOption, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const row = yield* self.engine.call(p + 'RiskAcceptance.get', { id }, ctx);
            const assessed = yield* self.engine.call(p + 'RiskAssessment.get', { id: row.assessment }, ctx);
            yield* new Evaluations(self.engine).result(String(assessed.evaluation), ctx);
            const state = yield* new Decisions(self.engine).state(String(row.decisionCase), ctx);
            if (!state.outcome || state.outcome.id !== row.outcome || state.outcome.selected !== acceptOption)
                return yield* Effect.fail(err('ValidationFailed', 'Risk acceptance is not backed by authoritative decision'));
            return row;
        });
    }
}
