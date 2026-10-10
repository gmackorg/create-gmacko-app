import { Effect } from "effect";
import { decodeDatetime } from "../codecs.js";
import { err } from "../errors.js";
import { findTerminalFact } from "./facts.js";
const prefix = "@forgegraph/foundation/party/_/";
/** Durable business identity only. These facts never authenticate or authorize a caller. */
export class Parties {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    call(operation, input, ctx) {
        return this.engine.call(prefix + operation, input, ctx);
    }
    create(input, ctx) {
        return this.call("Party.create", { label: input.label, identifiers: input.identifiers ?? null }, ctx);
    }
    represent(input, ctx) {
        return this.call("PrincipalRepresentation.create", { ...input, validUntil: input.validUntil ?? null, recordedBy: ctx.actor }, ctx);
    }
    revoke(representation, effectiveAt, reason, ctx) {
        return this.call("RepresentationRevocation.create", { representation, effectiveAt, reason, recordedBy: ctx.actor }, ctx);
    }
    listRepresentedAt(principal, at, ctx, page = {}) {
        const self = this;
        return Effect.gen(function* () {
            const instant = yield* Effect.try({ try: () => Date.parse(decodeDatetime(at)), catch: () => err("ValidationFailed", "Invalid representation lookup instant") });
            const rows = yield* self.call("PrincipalRepresentation.list.byPrincipal", { params: { principal }, ...page }, ctx);
            const items = [];
            for (const row of rows.items) {
                if (instant < Date.parse(String(row.validFrom)) || row.validUntil != null && instant >= Date.parse(String(row.validUntil)))
                    continue;
                const revocation = yield* findTerminalFact(self.engine, prefix + "RepresentationRevocation", "representation", row.id, ctx);
                if (revocation && instant >= Date.parse(String(revocation.effectiveAt)))
                    continue;
                // A readable association does not bypass the target Party's read policy.
                yield* self.call("Party.get", { id: row.party }, ctx);
                items.push({ representation: String(row.id), principal: String(row.principal), party: String(row.party) });
            }
            return { items, next: rows.next };
        });
    }
}
