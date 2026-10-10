/**
 * Purpose scoping at runtime (plan §8.4–8.5, M12). The compiled
 * `capabilities/1` plan is the static ceiling: a call under a purpose on a
 * `@purposeScoped` resource is checked *before* execution (filter/order
 * params, patch fields, named actions) and its result is rebuilt as a new
 * object holding only the surface's read fields (a cast never removes keys).
 * Runtime restrictions only intersect this ceiling (D09); several purposes in
 * one invocation are refused rather than unioned (PAR-102). Each (resource,
 * purpose) reader is a distinct Effect service key (PAR-103).
 */
import { Context, Effect } from "effect";
import { err } from "./errors.js";
const VISIBLE_ALWAYS = new Set(); // nothing is implicit: even `id` must be granted
export class Scope {
    engine;
    constructor(engine) {
        this.engine = engine;
    }
    plan() {
        return this.engine.model.bundle.capabilities ?? null;
    }
    strict() {
        return this.engine.model.bundle.ir.package.edition === "2027";
    }
    scoped(r) {
        return Boolean(r.decorators.purposeScoped);
    }
    /** Surface for (resource, purpose): `null` when the purpose has no binding on the resource. */
    surface(resourceId, purpose) {
        return this.plan()?.surfaces.find((s) => s.resource === resourceId && s.purpose === purpose) ?? null;
    }
    permits(s, verb, name) {
        return s.allowAtoms.some((a) => a.verb === verb && a.name === name) || VISIBLE_ALWAYS.has(name);
    }
    /**
     * Resolve the surface a call runs under, or `null` when scoping does not apply
     * (resource not purpose-scoped, or a privileged maintenance context). Fails when
     * a scoped resource is used without a usable purpose.
     */
    resolve(r, ctx) {
        if (!this.scoped(r))
            return Effect.succeed(null);
        if (ctx.maintenance)
            return Effect.succeed(null); // explicitly privileged; audited as such by the actor
        if (!ctx.purpose) {
            if (!this.strict())
                return Effect.succeed(null);
            return Effect.fail(err("NotPermitted", `${r.name} is purpose-scoped; an interface must select a purpose surface`));
        }
        if (ctx.purpose.includes(","))
            return Effect.fail(err("ValidationFailed", "one purpose per invocation: purposes are not unioned at runtime; declare a composite purpose with its own surface", { fields: [{ path: "purpose", code: "MultiplePurposes", message: ctx.purpose }] }));
        const s = this.surface(r.id, ctx.purpose);
        if (!s)
            return Effect.fail(err("NotPermitted", `purpose ${ctx.purpose} has no surface on ${r.name} (taxonomy relationships grant nothing)`));
        return Effect.succeed(s);
    }
    /** Query authority is separate from read authority: every partition and order key must be granted. */
    checkQuery(s, r, params, order) {
        for (const f of Object.keys(params)) {
            if (!this.permits(s, "filter", f))
                return Effect.fail(err("NotPermitted", `surface ${s.purpose} on ${r.name} grants no filter on \`${f}\` (a hidden field must not become a query oracle)`));
        }
        for (const f of order) {
            if (f === "id")
                continue; // the planner's deterministic tie-breaker: structural, reveals no content
            if (!this.permits(s, "order", f) && !this.permits(s, "filter", f))
                return Effect.fail(err("NotPermitted", `surface ${s.purpose} on ${r.name} grants no ordering by \`${f}\``));
        }
        return Effect.void;
    }
    checkPatch(s, r, patch) {
        for (const f of Object.keys(patch)) {
            if (!this.permits(s, "update", f))
                return Effect.fail(err("NotPermitted", `surface ${s.purpose} on ${r.name} grants no update of \`${f}\``));
        }
        return Effect.void;
    }
    checkCreate(s, r, input) {
        for (const f of Object.keys(input)) {
            if (!this.permits(s, "create", f))
                return Effect.fail(err("NotPermitted", `surface ${s.purpose} on ${r.name} grants no create of \`${f}\``));
        }
        return Effect.void;
    }
    checkAction(s, r, action) {
        if (!this.permits(s, "actions", `status.${action}`))
            return Effect.fail(err("NotPermitted", `surface ${s.purpose} on ${r.name} grants no action \`${action}\``));
        return Effect.void;
    }
    /**
     * A new object with only the granted read fields — never the stored object narrowed by a cast. A surface that
     * grants any write (update or action) also exposes `version`: optimistic concurrency needs the token, and the
     * token discloses nothing but the revision count.
     */
    project(s, record) {
        const out = {};
        for (const a of s.allowAtoms)
            if (a.verb === "read" && a.name in record)
                out[a.name] = record[a.name];
        if ("version" in record && !("version" in out) && s.allowAtoms.some((a) => a.verb === "update" || a.verb === "actions"))
            out["version"] = record["version"];
        return out;
    }
    projectPage(s, page) {
        return { ...page, items: page["items"].map((i) => this.project(s, i)) };
    }
}
const keys = new Map();
export function scopedReader(engine, resourceId, purpose) {
    const surface = engine.scope.surface(resourceId, purpose);
    if (!surface)
        throw new Error(`purpose ${purpose} has no surface on ${resourceId}`);
    const key = `forge/scoped/${resourceId}/${purpose}/${surface.digest}`;
    let service = keys.get(key);
    if (!service) {
        service = Context.Service()(key);
        keys.set(key, service);
    }
    const reader = {
        get: (id, ctx) => engine.call(`${resourceId}.get`, { id }, { ...ctx, purpose }),
        list: (query, params, ctx, page) => engine.call(`${resourceId}.list.${query}`, { params, ...(page ?? {}) }, { ...ctx, purpose }),
    };
    return { key, surface, service, reader };
}
