import { err } from "./errors.js";
const identity = (v) => typeof v === "string" &&
    v.length > 0 &&
    v.length <= 1024 &&
    !/[\x00-\x1f\x7f]/.test(v);
const oid = (v, f) => typeof v === "string" &&
    (f === "sha1" ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/).test(v);
export function validArtifactBranch(ref) {
    return (identity(ref) &&
        ref.startsWith("refs/heads/") &&
        !/[ ~^:?*\[\\]/.test(ref) &&
        !ref.includes("..") &&
        !ref.includes("@{") &&
        !ref.endsWith(".") &&
        ref
            .split("/")
            .every((p) => p.length > 0 && !p.startsWith(".") && !p.endsWith(".lock")));
}
/** Canonical intent encoding also scopes replay to actor and authorization purpose. */
export function artifactPublicationIntentKey(i) {
    const p = i.revision;
    return JSON.stringify([
        i.key,
        i.ref,
        i.expected,
        i.actor,
        i.purpose,
        p.tenant,
        p.artifact,
        p.generation,
        p.repositoryId,
        p.objectFormat,
        p.oid,
        p.tree,
    ]);
}
async function storage(work) {
    try {
        return await work();
    }
    catch {
        throw err("StorageUnavailable", "Artifact publication journal is unavailable");
    }
}
async function provider(work) {
    try {
        return await work();
    }
    catch {
        throw err("DependencyUnavailable", "Artifact publication provider is unavailable");
    }
}
export class ArtifactPublisher {
    journal;
    authorize;
    bindings = new Map();
    constructor(bindings, journal, authorize) {
        this.journal = journal;
        this.authorize = authorize;
        for (const b of bindings) {
            const key = JSON.stringify([b.tenant, b.artifact]);
            if (![b.tenant, b.artifact, b.generation, b.repositoryId].every(identity) ||
                this.bindings.has(key))
                throw err("ValidationFailed", "Invalid artifact publication binding");
            this.bindings.set(key, Object.freeze({ ...b }));
        }
    }
    publish(request, context) {
        return this.run(request, context, "publish");
    }
    /** Read-only provider reconciliation. Never retries a dispatch or claims a new key. */
    recover(request, context) {
        return this.run(request, context, "recover");
    }
    async run(request, context, action) {
        const ctx = Object.freeze({ ...context }), pin = Object.freeze({ ...request.revision });
        const intent = Object.freeze({
            key: request.key,
            ref: request.ref,
            expected: request.expected,
            revision: pin,
            actor: ctx.actor,
            purpose: ctx.purpose ?? null,
        });
        if (!identity(ctx.tenant) ||
            !identity(ctx.actor) ||
            pin.tenant !== ctx.tenant)
            throw err("NotPermitted", "Artifact publication is not permitted");
        const binding = this.bindings.get(JSON.stringify([ctx.tenant, pin.artifact]));
        if (!binding)
            throw err("NotPermitted", "Artifact publication is not permitted");
        if (!identity(intent.key) ||
            !validArtifactBranch(intent.ref) ||
            !["sha1", "sha256"].includes(pin.objectFormat) ||
            !oid(pin.oid, pin.objectFormat) ||
            !oid(pin.tree, pin.objectFormat) ||
            (intent.expected !== null && !oid(intent.expected, pin.objectFormat)))
            throw err("ValidationFailed", "Invalid artifact publication intent");
        let allowed = false;
        try {
            allowed = await this.authorize(Object.freeze({
                action,
                tenant: ctx.tenant,
                actor: ctx.actor,
                artifact: pin.artifact,
                generation: binding.generation,
                ref: intent.ref,
                expected: intent.expected,
                revision: pin,
                ...(ctx.purpose === undefined ? {} : { purpose: ctx.purpose }),
            }));
        }
        catch {
            /* fail closed */
        }
        if (allowed !== true)
            throw err("NotPermitted", "Artifact publication is not permitted");
        if (pin.generation !== binding.generation ||
            pin.repositoryId !== binding.repositoryId)
            throw err("VersionConflict", "Artifact publication binding changed");
        const repo = await provider(() => binding.provider.open());
        try {
            if (repo.repositoryId !== binding.repositoryId ||
                repo.objectFormat !== pin.objectFormat)
                throw err("VersionConflict", "Artifact repository identity changed");
            const check = (receipt) => {
                if (artifactPublicationIntentKey(receipt.intent) !==
                    artifactPublicationIntentKey(intent))
                    throw err("IdempotencyMismatch", "Artifact publication key has a different intent");
                return Object.freeze({ ...receipt, intent });
            };
            const existing = await storage(() => this.journal.get(intent));
            if (existing) {
                const receipt = check(existing);
                if (action === "publish" || receipt.outcome !== "pending")
                    return receipt;
                const head = await provider(() => repo.head(intent.ref));
                if (head !== null && !oid(head, pin.objectFormat))
                    throw err("ValidationFailed", "Invalid artifact provider head");
                return head === pin.oid
                    ? check(await storage(() => this.journal.finish(intent, "observed")))
                    : receipt;
            }
            if (action === "recover")
                throw err("NotFound", "Artifact publication receipt is unavailable");
            const commit = await provider(() => repo.commit(pin.oid));
            if (!commit || commit.oid !== pin.oid || commit.tree !== pin.tree)
                throw err("ValidationFailed", "Artifact publication commit does not match the pin");
            const claim = await storage(() => this.journal.claim(intent));
            const receipt = check(claim.receipt);
            if (!claim.owned || receipt.outcome !== "pending")
                return receipt;
            let outcome;
            try {
                outcome = await repo.compareAndSwap(intent.ref, intent.expected, pin.oid);
                if (outcome !== "accepted" && outcome !== "rejected")
                    return receipt;
            }
            catch {
                return receipt;
            }
            // If persistence fails, pending survives for read-only reconciliation.
            return check(await storage(() => this.journal.finish(intent, outcome)));
        }
        finally {
            await provider(() => repo.dispose());
        }
    }
}
