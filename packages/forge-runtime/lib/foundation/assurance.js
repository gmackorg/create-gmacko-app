import { Attestations } from "./attestation.js";
import { Evaluations } from "./evaluation.js";
import { Effect } from "effect";
import { err } from "../errors.js";
import { findTerminalFact } from "./facts.js";
const p = "@forgegraph/foundation/assurance/_/", evaluation = "@forgegraph/foundation/evaluation/_/";
export class Assurance {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    disposition(finding, kind, reason, ctx) { return this.engine.call(p + 'Disposition.create', { finding, kind, reason, recordedBy: ctx.actor }, ctx); }
    findingPhase(finding, ctx) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.engine.call(p + 'Finding.get', { id: finding }, ctx);
            const closure = yield* findTerminalFact(self.engine, p + 'FindingClosure', 'finding', finding, ctx);
            if (closure)
                return 'Closed';
            const disposition = yield* findTerminalFact(self.engine, p + 'Disposition', 'finding', finding, ctx);
            return disposition ? String(disposition.kind) : 'Open';
        });
    }
    remediationPhase(remediation, ctx) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.engine.call(p + 'Remediation.get', { id: remediation }, ctx);
            const finish = yield* findTerminalFact(self.engine, p + 'RemediationFinish', 'remediation', remediation, ctx);
            return finish ? String(finish.outcome) : 'Planned';
        });
    }
    issue(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.support(input, ctx);
            return yield* self.engine.call(p + 'FindingAttestation.create', input, ctx);
        });
    }
    end(id, effectiveAt, reason, ctx, replacement) {
        const self = this;
        return Effect.gen(function* () {
            const row = yield* self.engine.call(p + 'FindingAttestation.get', { id }, ctx);
            const next = replacement ? yield* self.engine.call(p + 'FindingAttestation.get', { id: replacement }, ctx) : null;
            if (next && next.finding !== row.finding)
                return yield* Effect.fail(err('ValidationFailed', 'Replacement must concern the same finding'));
            return yield* new Attestations(self.engine).end(String(row.attestation), effectiveAt, reason, ctx, next ? String(next.attestation) : undefined);
        });
    }
    current(id, at, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const row = yield* self.engine.call(p + 'FindingAttestation.get', { id }, ctx);
            const assertion = yield* new Attestations(self.engine).current(String(row.attestation), at, ctx);
            if (!assertion)
                return null;
            yield* self.support(row, ctx);
            return { ...assertion, ...row };
        });
    }
    support(record, ctx) {
        const self = this;
        return Effect.gen(function* () {
            yield* self.engine.call(p + 'Finding.get', { id: record.finding }, ctx);
            yield* self.engine.call(evaluation + 'EvaluationRun.get', { id: record.run }, ctx);
            yield* new Evaluations(self.engine).result(String(record.finish), ctx);
            yield* new Attestations(self.engine).read(String(record.attestation), ctx);
        });
    }
}
