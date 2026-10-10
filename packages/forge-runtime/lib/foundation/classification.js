import { Effect } from "effect";
import { decodeDatetime } from "../codecs.js";
import { err } from "../errors.js";
import { findTerminalFact } from "./facts.js";
const prefix = "@forgegraph/foundation/classification/_/";
/** Historical meaning never floats through a supersession. The caller explicitly
 * chooses a successor revision after inspecting lifecycle at its effective time. */
export class Classification {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    status(concept, at, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const instant = yield* Effect.try({ try: () => Date.parse(decodeDatetime(at)), catch: () => err("ValidationFailed", "Invalid classification instant") });
            yield* self.engine.call(prefix + "Concept.get", { id: concept }, ctx);
            const disposition = yield* findTerminalFact(self.engine, prefix + "ConceptDisposition", "concept", concept, ctx);
            if (!disposition || instant < Date.parse(String(disposition.effectiveAt)))
                return { state: "active", replacement: null };
            return { state: disposition.replacement == null ? "retired" : "superseded", replacement: disposition.replacement };
        });
    }
    resolveAssignment(assignment, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const fact = yield* self.engine.call(prefix + "ClassificationAssignment.get", { id: assignment }, ctx);
            return yield* self.engine.call(prefix + "ConceptRevision.get", { id: fact.meaning }, ctx);
        });
    }
}
