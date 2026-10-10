import { Effect } from "effect";
import { err } from "../errors.js";
const prefix = "@forgegraph/foundation/artifact/_/";
/** Publication accepts only sealed write-once content. Schema rules also enforce
 * digest/type/size equality, including callers of the underlying create operation. */
export class Artifacts {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    publish(input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const content = yield* self.engine.call(prefix + "ArtifactContent.get", { id: input.content }, ctx);
            if (content.uploadState !== "ready" || content.digest !== input.digest)
                return yield* Effect.fail(err("ValidationFailed", "Publication requires sealed content with the expected digest"));
            if (input.components)
                yield* self.components(input.components, ctx);
            if (input.realization) {
                const realization = yield* self.engine.call("@forgegraph/foundation/specification/_/Realization.get", { id: input.realization }, ctx);
                if (realization.pin !== input.specificationPin || realization.manifestDigest !== input.digest)
                    return yield* Effect.fail(err("ValidationFailed", "Realization must pin this specification and manifest digest"));
            }
            return yield* self.engine.call(prefix + "ArtifactRevision.create", {
                artifact: input.artifact, content: input.content, digest: content.digest,
                mediaType: content.mediaType, byteCount: content.byteCount,
                specificationPin: input.specificationPin ?? null, realization: input.realization ?? null, components: input.components ?? null,
            }, ctx);
        });
    }
    /** Build the immutable chain before publication; a revision pins its exact head.
     * Appending another node cannot alter a published revision's membership. */
    component(name, revision, next, ctx) {
        return this.engine.call(prefix + "ArtifactComponent.create", { name, revision, next }, ctx);
    }
    components(head, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const items = [];
            const seen = new Set(), names = new Set();
            let current = head;
            while (current) {
                if (seen.has(current) || items.length === 128)
                    return yield* Effect.fail(err("BudgetExceeded", "Manifest must be acyclic and contain at most 128 components"));
                seen.add(current);
                const node = yield* self.engine.call(prefix + "ArtifactComponent.get", { id: current }, ctx);
                if (names.has(String(node.name)))
                    return yield* Effect.fail(err("ValidationFailed", "Duplicate manifest component name"));
                names.add(String(node.name));
                // Reading a manifest cannot reveal an otherwise unreadable revision.
                yield* self.engine.call(prefix + "ArtifactRevision.get", { id: node.revision }, ctx);
                items.push({ name: String(node.name), revision: String(node.revision) });
                current = node.next == null ? null : String(node.next);
            }
            return items;
        });
    }
    download(revision, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const record = yield* self.engine.call(prefix + "ArtifactRevision.get", { id: revision }, ctx);
            return yield* self.engine.call(prefix + "ArtifactContent.download", { id: record.content }, ctx);
        });
    }
}
