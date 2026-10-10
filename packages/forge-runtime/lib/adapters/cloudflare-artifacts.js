/** Bind only server-selected repository names. The reader verifies the stable repo
 * ID against its configured binding on every open, rejecting name reuse. */
export function cloudflareArtifactsReader(binding, name) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(name))
        throw new Error('Invalid configured artifact repository name');
    return { async open() {
            const handle = await binding.get(name);
            try {
                const info = await handle.info();
                if (info.name !== name || typeof info.id !== 'string' || !info.id)
                    throw new Error('Invalid artifact repository metadata');
                return {
                    repositoryId: info.id, objectFormat: 'sha1',
                    async resolve(selector) {
                        const entries = await handle.log({ ref: selector, limit: 1 });
                        if (!Array.isArray(entries) || entries.length > 1 || entries.length === 1 && !/^[a-f0-9]{40}$/.test(entries[0]?.hash ?? ''))
                            throw new Error('Invalid artifact discovery result');
                        return entries[0]?.hash ?? null;
                    },
                    async commit(oid) {
                        const commit = await handle.readCommit(oid);
                        return commit === null ? null : { oid: commit.hash, tree: commit.treeHash, parents: commit.parents };
                    },
                    file: (oid, path) => handle.readFile({ ref: oid, path }),
                    dispose: () => handle[Symbol.dispose](),
                };
            }
            catch (error) {
                handle[Symbol.dispose]();
                throw error;
            }
        } };
}
