/**
 * Typed view over the compiled app bundle (`forgec build` output). The runtime
 * interprets this model; it never re-derives semantics from source.
 */
/** Critical IR features this runtime understands; unknown `requires` entries fail closed (plan §4.2). */
export const KNOWN_FEATURES = ["sealed-content/1", "append-only/1", "governance/1", "conditional-unique/1", "projection-aggregates/1", "collections/1", "workflow-map/1", "sequences/1", "work-queues/1", "credentials/1", "search-exact/1", "actors/1"];
export const DOMAIN_IR_VERSION = "domain-ir/1";
export class Model {
    bundle;
    resources;
    functions;
    channels;
    views;
    projections;
    caches;
    workflows;
    sources;
    enums = new Map();
    byId = new Map();
    ops = new Map();
    wireNames = new Map();
    purposes;
    dataClasses;
    constructor(bundle) {
        this.bundle = bundle;
        // Fail closed (plan §4.2): an artifact from a newer compiler with critical semantics this
        // runtime does not know is refused rather than interpreted partially. An M8 bundle (no
        // `requires`, no governance fields) loads by rule: every new field defaults to empty.
        if (bundle.ir.version !== DOMAIN_IR_VERSION)
            throw new Error(`unsupported IR version ${bundle.ir.version} (this runtime reads ${DOMAIN_IR_VERSION})`);
        const unknown = (bundle.ir.requires ?? []).find((f) => !KNOWN_FEATURES.includes(f));
        if (unknown)
            throw new Error(`bundle requires unknown critical feature ${unknown}; refusing to run it partially`);
        this.purposes = bundle.ir.modules.flatMap((m) => m.purposes ?? []);
        this.dataClasses = bundle.ir.modules.flatMap((m) => m.dataClasses ?? []);
        this.resources = bundle.ir.modules.flatMap((m) => m.resources);
        this.functions = bundle.ir.modules.flatMap((m) => m.functions ?? []);
        this.channels = bundle.ir.modules.flatMap((m) => m.channels ?? []);
        this.views = bundle.ir.modules.flatMap((m) => m.views ?? []);
        this.projections = bundle.ir.modules.flatMap((m) => m.projections ?? []);
        this.caches = bundle.ir.modules.flatMap((m) => m.caches ?? []);
        this.workflows = bundle.ir.modules.flatMap((m) => m.workflows ?? []);
        this.sources = bundle.ir.modules.flatMap((m) => m.sources ?? []);
        for (const m of bundle.ir.modules)
            for (const e of m.enums)
                this.enums.set(e.id, e);
        for (const r of this.resources) {
            const validateReferencePath = (expression) => {
                switch (expression.kind) {
                    case "name":
                        if (expression.path.length > 2 && r.fields.some(f => f.name === expression.path[0] && f.type.base.kind === "reference")) {
                            throw new Error(`unsupported multi-hop reference expression ${expression.path.join(".")} on ${r.id}; recompile with a direct reference`);
                        }
                        break;
                    case "binary":
                        validateReferencePath(expression.lhs);
                        validateReferencePath(expression.rhs);
                        break;
                    case "unary":
                        validateReferencePath(expression.operand);
                        break;
                    case "call":
                        expression.args.forEach(validateReferencePath);
                        break;
                    case "literal": break;
                }
            };
            r.rules.forEach(validateReferencePath);
            for (const field of r.fields)
                if (field.derived)
                    validateReferencePath(field.derived);
            for (const view of this.views)
                if (view.source === r.id && view.where)
                    validateReferencePath(view.where);
            for (const projection of this.projections)
                if (projection.source === r.id) {
                    if (projection.where)
                        validateReferencePath(projection.where);
                    for (const aggregate of projection.aggregates)
                        if (aggregate.filter)
                            validateReferencePath(aggregate.filter);
                }
            this.byId.set(r.id, r);
            for (const op of r.operations)
                this.ops.set(op.id, { op, resource: r });
        }
        for (const c of bundle.contracts.resources)
            this.wireNames.set(c.id, c.wireName);
    }
    /** (child resource, field) pairs that reference `resourceId`. */
    dependentsOf(resourceId) {
        const out = [];
        for (const r of this.resources) {
            for (const f of r.fields) {
                if (f.type.base.kind === "reference" && f.type.base.resource === resourceId && (!f.synthesized || f.name === "parent"))
                    out.push({ resource: r, field: f.name });
            }
        }
        return out;
    }
    resource(id) {
        const r = this.byId.get(id);
        if (!r)
            throw new Error(`unknown resource ${id}`);
        return r;
    }
    function(id) {
        return this.functions.find((f) => f.id === id);
    }
    /** Resolve a channel by stable id or local name (declared or implicit `<Resource>.changes`). */
    channel(ref) {
        const declared = this.channels.find((c) => c.id === ref || c.name === ref);
        if (declared)
            return { id: declared.id, messages: declared.messages.map((m) => m.name), ...(declared.direction ? { direction: declared.direction } : {}) };
        const planned = this.bundle.messaging?.channels.find((c) => c.id === ref || c.name === ref);
        return planned ? { id: planned.id, messages: planned.messages.map((m) => m.name), ...(planned.direction ? { direction: planned.direction } : {}) } : undefined;
    }
    subscription(name) {
        return this.bundle.messaging?.subscriptions.find((s) => s.name === name);
    }
    operation(id) {
        return this.ops.get(id);
    }
    wireName(resourceId) {
        return this.wireNames.get(resourceId) ?? resourceId;
    }
    /** Operations that carry an HTTP binding, in a stable order. */
    httpOperations() {
        return [...this.ops.values()].filter((o) => o.op.http);
    }
    enumValues(id) {
        return this.enums.get(id)?.members.map((m) => m.value) ?? [];
    }
}
export function fieldOf(r, name) {
    return r.fields.find((f) => f.name === name);
}
/** Scale used for a decimal/money field's minor-unit arithmetic and sort keys. */
export function scaleOf(t) {
    if (t.base.kind !== "scalar")
        return 0;
    if (t.base.name === "money") {
        const cur = t.base.args[0] ?? "USD";
        return { JPY: 0, KRW: 0, CLP: 0, KWD: 3, BHD: 3 }[cur] ?? 2;
    }
    if (t.base.name === "decimal")
        return Number(t.base.args[0] ?? 2);
    return 0;
}
