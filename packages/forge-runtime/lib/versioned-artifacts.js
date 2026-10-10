import { err } from './errors.js';
const MAX_COMMITS = 1024, MAX_BYTES = 32 * 1024 * 1024, MAX_PARENTS = 32;
const identity = (value) => typeof value === 'string' && value.length > 0 && value.length <= 1024 && !/[\x00-\x1f\x7f]/.test(value);
const oidValid = (value, format) => typeof value === 'string' && (format === 'sha1' ? /^[a-f0-9]{40}$/ : /^[a-f0-9]{64}$/).test(value);
function budget(value, fallback) {
    const limit = value ?? fallback;
    if (!Number.isSafeInteger(limit) || limit < 1 || limit > fallback)
        throw err('ValidationFailed', 'Invalid artifact read budget');
    return limit;
}
/** Never copy provider messages, response bodies or credentials into public errors. */
async function providerCall(call) {
    try {
        return await call();
    }
    catch (error) {
        const code = error && typeof error === 'object' && 'code' in error ? error.code : undefined;
        if (code === 'NOT_FOUND')
            throw err('NotFound', 'Artifact repository or object is unavailable');
        if (['CREATE_IN_PROGRESS', 'IMPORT_IN_PROGRESS', 'FORK_IN_PROGRESS'].includes(String(code)))
            throw err('ProjectionNotReady', 'Artifact repository is not ready');
        throw err('DependencyUnavailable', 'Artifact provider request failed');
    }
}
function commitSnapshot(commit, oid, format) {
    if (commit === null)
        throw err('NotFound', 'Pinned artifact commit is unavailable');
    if (!commit || commit.oid !== oid || !oidValid(commit.tree, format) || !Array.isArray(commit.parents) || commit.parents.length > MAX_PARENTS || commit.parents.some(p => !oidValid(p, format)) || new Set(commit.parents).size !== commit.parents.length)
        throw err('ValidationFailed', 'Invalid artifact commit metadata');
    return Object.freeze({ oid, tree: commit.tree, parents: Object.freeze([...commit.parents]) });
}
export class VersionedArtifactReader {
    authorize;
    capabilities = Object.freeze({ resolve: true, readFile: true, history: true, publish: false, merge: false, fork: false });
    bindings = new Map();
    constructor(bindings, authorize) {
        this.authorize = authorize;
        for (const binding of bindings) {
            if (![binding.tenant, binding.artifact, binding.generation, binding.repositoryId].every(identity))
                throw err('ValidationFailed', 'Invalid artifact binding');
            const key = JSON.stringify([binding.tenant, binding.artifact]);
            if (this.bindings.has(key))
                throw err('ValidationFailed', 'Duplicate artifact binding');
            this.bindings.set(key, Object.freeze({ ...binding }));
        }
    }
    async binding(artifact, ctx, action, pin) {
        if (!identity(artifact) || !identity(ctx.tenant) || !identity(ctx.actor))
            throw err('NotPermitted', 'Artifact read is not permitted');
        const binding = this.bindings.get(JSON.stringify([ctx.tenant, artifact]));
        if (!binding || pin && pin.tenant !== ctx.tenant)
            throw err('NotPermitted', 'Artifact read is not permitted');
        // Authorization is evaluated on every operation, including reads of old pins.
        let allowed;
        try {
            allowed = await this.authorize(Object.freeze({ action, tenant: ctx.tenant, actor: ctx.actor, artifact, generation: binding.generation, ...(ctx.purpose === undefined ? {} : { purpose: ctx.purpose }) }));
        }
        catch {
            throw err('NotPermitted', 'Artifact read is not permitted');
        }
        if (allowed !== true)
            throw err('NotPermitted', 'Artifact read is not permitted');
        if (pin && (pin.generation !== binding.generation || pin.repositoryId !== binding.repositoryId))
            throw err('VersionConflict', 'Artifact repository binding changed');
        if (pin && (!['sha1', 'sha256'].includes(pin.objectFormat) || !oidValid(pin.oid, pin.objectFormat) || !oidValid(pin.tree, pin.objectFormat)))
            throw err('ValidationFailed', 'Invalid artifact revision pin');
        return binding;
    }
    async withRepository(binding, work) {
        const repo = await providerCall(() => binding.provider.open());
        try {
            if (repo.repositoryId !== binding.repositoryId)
                throw err('VersionConflict', 'Artifact repository identity changed');
            if (!['sha1', 'sha256'].includes(repo.objectFormat))
                throw err('ValidationFailed', 'Unsupported artifact object format');
            return await work(repo);
        }
        finally {
            await providerCall(() => repo.dispose());
        }
    }
    async pinnedCommit(repo, pin) {
        if (pin.objectFormat !== repo.objectFormat)
            throw err('VersionConflict', 'Artifact object format changed');
        const commit = commitSnapshot(await providerCall(() => repo.commit(pin.oid)), pin.oid, repo.objectFormat);
        if (commit.tree !== pin.tree)
            throw err('ValidationFailed', 'Artifact provider substituted pinned tree');
        return commit;
    }
    async resolve(artifact, selector, context) {
        const ctx = Object.freeze({ ...context });
        if (!identity(selector))
            throw err('ValidationFailed', 'Invalid artifact selector');
        const binding = await this.binding(artifact, ctx, 'resolve');
        return this.withRepository(binding, async (repo) => {
            const oid = await providerCall(() => repo.resolve(selector));
            if (oid === null)
                throw err('NotFound', 'Artifact selector has no commit');
            if (!oidValid(oid, repo.objectFormat))
                throw err('ValidationFailed', 'Invalid artifact object ID');
            const commit = commitSnapshot(await providerCall(() => repo.commit(oid)), oid, repo.objectFormat);
            return Object.freeze({ tenant: ctx.tenant, artifact, generation: binding.generation, repositoryId: binding.repositoryId, objectFormat: repo.objectFormat, oid, tree: commit.tree });
        });
    }
    async readFile(revision, path, context, options = {}) {
        const pin = Object.freeze({ ...revision }), ctx = Object.freeze({ ...context }), maxBytes = budget(options.maxBytes, MAX_BYTES);
        if (!identity(path) || path.startsWith('/') || path.includes('\\') || path.split('/').some(p => !p || p === '.' || p === '..'))
            throw err('ValidationFailed', 'Invalid artifact file path');
        const binding = await this.binding(pin.artifact, ctx, 'readFile', pin);
        return this.withRepository(binding, async (repo) => {
            await this.pinnedCommit(repo, pin);
            const blob = await providerCall(() => repo.file(pin.oid, path));
            if (blob === null)
                throw err('NotFound', 'Artifact file is unavailable');
            if (!Number.isSafeInteger(blob.size) || blob.size < 0 || blob.size > maxBytes)
                throw err('BudgetExceeded', 'Artifact file exceeds byte budget');
            const bytes = new Uint8Array(await providerCall(() => blob.arrayBuffer()));
            if (bytes.byteLength !== blob.size || bytes.byteLength > maxBytes)
                throw err('BudgetExceeded', 'Artifact file exceeds byte budget');
            return { bytes, mediaType: blob.type };
        });
    }
    /** Deterministic depth-first traversal in parent order; never a truncated success.
     * Missing/shallow ancestry, cycles and exhausted budgets fail explicitly. */
    async history(revision, context, options = {}) {
        const pin = Object.freeze({ ...revision }), ctx = Object.freeze({ ...context }), maxCommits = budget(options.maxCommits, MAX_COMMITS);
        const binding = await this.binding(pin.artifact, ctx, 'history', pin);
        return this.withRepository(binding, async (repo) => {
            if (pin.objectFormat !== repo.objectFormat)
                throw err('VersionConflict', 'Artifact object format changed');
            const output = [], active = new Set(), done = new Set();
            const stack = [{ oid: pin.oid, exit: false }];
            while (stack.length) {
                const item = stack.pop();
                if (item.exit) {
                    active.delete(item.oid);
                    done.add(item.oid);
                    continue;
                }
                if (active.has(item.oid))
                    throw err('ValidationFailed', 'Artifact history contains a cycle');
                if (done.has(item.oid))
                    continue;
                if (output.length >= maxCommits)
                    throw err('BudgetExceeded', 'Artifact history exceeds commit budget');
                const commit = commitSnapshot(await providerCall(() => repo.commit(item.oid)), item.oid, repo.objectFormat);
                if (item.oid === pin.oid && commit.tree !== pin.tree)
                    throw err('ValidationFailed', 'Artifact provider substituted pinned tree');
                output.push(commit);
                active.add(item.oid);
                stack.push({ oid: item.oid, exit: true });
                for (const parent of [...commit.parents].reverse())
                    stack.push({ oid: parent, exit: false });
            }
            return Object.freeze(output);
        });
    }
}
