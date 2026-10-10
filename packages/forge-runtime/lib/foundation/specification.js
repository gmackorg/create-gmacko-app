export function validateSpecificationPin(pin) {
    if (!pin.repository || !pin.anchor || !/^([0-9a-f]{40}|[0-9a-f]{64})$/.test(pin.revision)) {
        throw new Error("Specification pins require a repository, semantic anchor and complete lowercase Git object ID");
    }
}
export async function resolveSpecificationSelector(provider, request) {
    const expected = { ...request };
    if (!expected.repository || !expected.anchor || !expected.selector)
        throw new Error("Selector resolution requires repository, anchor and selector");
    const resolved = await provider.resolveSelector({ ...expected });
    validateSpecificationPin(resolved);
    if (resolved.repository !== expected.repository || resolved.anchor !== expected.anchor)
        throw new Error("Provider substituted specification identity");
    // Copy only durable identity; never persist a discovery selector or provider-owned mutable object.
    return Object.freeze({ repository: resolved.repository, anchor: resolved.anchor, revision: resolved.revision });
}
export async function resolveSpecificationSourceSpan(provider, pin) {
    const expected = Object.freeze({ ...pin });
    validateSpecificationPin(expected);
    const result = await provider.sourceMap(expected);
    if (result.repository !== expected.repository || result.map.version !== "forge-source-map/1" || result.map.revision !== expected.revision)
        throw new Error("Source map does not match pinned repository and commit");
    const span = Object.hasOwn(result.map.anchors, expected.anchor) ? result.map.anchors[expected.anchor] : undefined;
    if (!span || !span.file || !Number.isSafeInteger(span.start) || !Number.isSafeInteger(span.end) || span.start < 0 || span.end < span.start)
        throw new Error("Pinned semantic anchor has no valid source span");
    return Object.freeze({ file: span.file, start: span.start, end: span.end });
}
