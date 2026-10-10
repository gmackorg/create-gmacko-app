import { Effect } from "effect";
import { findTerminalFact } from "./facts.js";
import { decodeDatetime } from "../codecs.js";
import { err } from "../errors.js";
const prefix = "@forgegraph/foundation/identifiers/_/";
/** Typed sidecar operations. Applications map IdentifierSet back to a typed owner.
 * Namespace names fold to lowercase; this initial profile trims case-sensitive values. */
export class Identifiers {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    call(operation, input, ctx) {
        return this.engine.call(prefix + operation, input, ctx);
    }
    assign(input, ctx) {
        return this.call("Identifier.create", {
            identifierSet: input.identifierSet, namespace: input.namespace, value: input.value,
            issuer: input.issuer ?? null, issuerScope: input.issuer ?? "namespace",
            validFrom: input.validFrom, validUntil: input.validUntil ?? null,
        }, ctx);
    }
    revoke(identifier, effectiveAt, reason, ctx) {
        return this.call("IdentifierDisposition.create", { identifier, replacement: null, effectiveAt, reason }, ctx);
    }
    supersede(identifier, replacement, effectiveAt, reason, ctx) {
        return this.call("IdentifierDisposition.create", { identifier, replacement, effectiveAt, reason }, ctx);
    }
    lookup(qualified, at, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const instant = yield* Effect.try({ try: () => Date.parse(decodeDatetime(at)), catch: () => err("ValidationFailed", "Invalid identifier lookup instant") });
            const identifier = yield* self.call("Identifier.find.byNamespaceIssuerScopeValue", { params: {
                    namespace: qualified.namespace, issuerScope: qualified.issuer ?? "namespace", value: qualified.value,
                } }, ctx).pipe(Effect.catch(e => e.code === "NotFound" ? Effect.succeed(null) : Effect.fail(e)));
            if (!identifier || instant < Date.parse(String(identifier.validFrom)) || (identifier.validUntil != null && instant >= Date.parse(String(identifier.validUntil))))
                return null;
            const disposition = yield* findTerminalFact(self.engine, prefix + "IdentifierDisposition", "identifier", identifier.id, ctx);
            if (disposition && instant >= Date.parse(String(disposition.effectiveAt)))
                return null;
            return { identifier: String(identifier.id), identifierSet: String(identifier.identifierSet) };
        });
    }
    listBySet(identifierSet, ctx, page = {}) {
        return this.call("Identifier.list.byIdentifierSet", { params: { identifierSet }, ...page }, ctx);
    }
}
