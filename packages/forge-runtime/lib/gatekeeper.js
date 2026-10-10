/**
 * Gatekeeper boundary (plan §9–10, FORGE-048..051). Forge computes the
 * canonical request (principal, action, purpose, resource scope, current and
 * candidate state, PIP values with freshness, epochs) and an `Authorizer`
 * returns a typed decision: allow / deny with plan constraints, obligations
 * from a known set, expiry and the policy epoch. Unknown obligations and
 * missing or stale attributes deny. `localAuthorizer` is the built-in typed
 * evaluator (a verified subset: equality/membership on record fields with
 * values from constants or PIP attributes); a remote Gatekeeper or OPA
 * adapter implements the same interface. Decisions are cached per (epoch,
 * principal, action, purpose, record revision) with a bounded TTL, so a
 * revocation that bumps the epoch invalidates every cached allow at once.
 */
import { Effect } from "effect";
import { err } from "./errors.js";
function matches(pattern, action) {
    if (pattern.endsWith(".*"))
        return action.startsWith(pattern.slice(0, -1));
    return pattern === action;
}
function conditionValues(c, attrs) {
    if (c.values)
        return c.values;
    if (c.from) {
        const a = attrs.find((x) => x.pip === c.from.pip && x.attribute === c.from.attribute);
        if (!a)
            return null;
        return c.from.map[String(a.value)] ?? [];
    }
    return [];
}
function holds(c, rec, values) {
    const v = rec[c.field];
    switch (c.op) {
        case "eq": return values.length === 1 && v === values[0];
        case "ne": return !values.includes(v);
        case "in": return values.includes(v);
    }
}
export function localAuthorizer(o) {
    const ttl = o.ttlMs ?? 60_000;
    const applicable = (action, purpose) => o.policies.filter((p) => p.actions.some((a) => matches(a, action)) && (!p.purpose || p.purpose === purpose));
    return {
        epoch: o.epoch,
        knownObligations: o.knownObligations,
        pips: o.pips,
        requirements: (action, purpose) => applicable(action, purpose).flatMap((p) => p.requires),
        rowFilterFor: (action, purpose, attrs) => {
            const ps = applicable(action, purpose);
            if (ps.length !== 1)
                return null;
            const p = ps[0];
            if (p.where.length === 0)
                return { policy: p.id, filter: [] };
            const filter = [];
            for (const c of p.where) {
                const values = conditionValues(c, attrs);
                if (values === null)
                    return "unsupported";
                filter.push({ field: c.field, op: c.op, values });
            }
            return { policy: p.id, filter };
        },
        decide: (req) => Effect.sync(() => {
            const expiresAt = new Date(Date.now() + ttl).toISOString();
            const ps = applicable(req.action, req.purpose);
            const decisionId = crypto.randomUUID();
            const deny = (reason, policy) => ({ effect: "deny", decisionId, ...(policy ? { policy } : {}), obligations: [], epoch: o.epoch, expiresAt, reason });
            if (ps.length === 0)
                return deny("no policy permits this action for this purpose");
            // Each policy stands alone: one that cannot apply (missing/stale attribute, unimplementable
            // obligation) is skipped, never a reason to allow; the first cause is reported when none allows.
            let firstCause = null;
            const skip = (reason, policy) => { firstCause ??= deny(reason, policy); };
            for (const p of ps) {
                let applies = true;
                for (const r of p.requires) {
                    const a = req.attributes.find((x) => x.pip === r.pip && x.attribute === r.attribute);
                    if (!a) {
                        skip(`required attribute ${r.pip}.${r.attribute} is missing`, p.id);
                        applies = false;
                        break;
                    }
                    if (a.expiresAt <= new Date().toISOString()) {
                        skip(`required attribute ${r.pip}.${r.attribute} is stale`, p.id);
                        applies = false;
                        break;
                    }
                }
                if (!applies)
                    continue;
                const obligations = p.obligations ?? [];
                const unknown = obligations.find((ob) => !o.knownObligations.includes(ob.kind));
                if (unknown) {
                    skip(`mandatory obligation ${unknown.kind} is not implemented by this runtime`, p.id);
                    continue;
                }
                let ok = true;
                const rowFilter = [];
                for (const c of p.where) {
                    const values = conditionValues(c, req.attributes);
                    if (values === null) {
                        ok = false;
                        break;
                    }
                    rowFilter.push({ field: c.field, op: c.op, values });
                    // Current AND candidate state must satisfy the predicate (PAR-110).
                    for (const state of [req.current, req.candidate]) {
                        if (state && !holds(c, state, values)) {
                            ok = false;
                            break;
                        }
                    }
                    if (!ok)
                        break;
                }
                if (ok)
                    return { effect: "allow", decisionId, policy: p.id, rowFilter, obligations, epoch: o.epoch, expiresAt };
            }
            return firstCause ?? deny("no applicable policy allows this record", ps[0].id);
        }),
    };
}
// ------------------------------------------------------------ runtime side
export class Gatekeeper {
    engine;
    authorizer = null;
    cache = new Map();
    hits = 0;
    misses = 0;
    constructor(engine) {
        this.engine = engine;
    }
    cacheStats() {
        return { hits: this.hits, misses: this.misses, size: this.cache.size };
    }
    pipProviders() {
        return this.authorizer?.pips ?? this.pips;
    }
    pips = [];
    /** Gather the attributes a policy requires; each value carries observedAt/expiresAt. */
    attributes(action, purpose, actor) {
        if (!this.authorizer)
            return [];
        const out = [];
        for (const r of this.authorizer.requirements(action, purpose)) {
            const p = this.pipProviders().find((x) => x.name === r.pip);
            const v = p?.attributes[actor]?.[r.attribute];
            if (p && v !== undefined) {
                const now = Date.now();
                out.push({ pip: r.pip, attribute: r.attribute, value: v, observedAt: new Date(now).toISOString(), expiresAt: new Date(now + p.freshnessMs).toISOString() });
            }
        }
        return out;
    }
    /** Decide for one record (current and optional candidate). Cached per epoch/principal/action/purpose/record revision. */
    /** Last decision taken (operator diagnostics; never part of a caller-visible error). */
    lastDecision = null;
    decide(action, kind, r, ctx, current, candidate) {
        const self = this;
        if (!self.authorizer)
            return Effect.succeed({ effect: "allow", decisionId: "no-authorizer", obligations: [], epoch: 0, expiresAt: new Date(Date.now() + 1000).toISOString() });
        // Explicit service authority (seeding, migration, system tasks): audited by actor, not policy-gated.
        if (ctx.maintenance)
            return Effect.succeed({ effect: "allow", decisionId: "maintenance", obligations: [], epoch: self.authorizer.epoch, expiresAt: new Date(Date.now() + 1000).toISOString(), reason: "maintenance context" });
        const a = self.authorizer;
        const attrs = self.attributes(action, ctx.purpose, ctx.actor);
        const rev = current ? `${String(current["id"])}@${String(current["version"] ?? "")}` : "-";
        const cand = candidate ? JSON.stringify(candidate) : "";
        const key = `${a.epoch}|${ctx.tenant}|${ctx.actor}|${action}|${ctx.purpose ?? ""}|${rev}|${cand}|${attrs.map((x) => `${x.pip}.${x.attribute}=${String(x.value)}`).join(",")}`;
        const hit = self.cache.get(key);
        if (!a.liveAttributes && hit && hit.until > Date.now() && hit.decision.epoch === a.epoch) {
            self.hits++;
            return Effect.succeed(hit.decision);
        }
        self.misses++;
        return a
            .decide({ principal: { tenant: ctx.tenant, actor: ctx.actor }, action, kind, ...(r ? { resource: r.id } : {}), ...(ctx.purpose ? { purpose: ctx.purpose } : {}), ...(current ? { current } : {}), ...(candidate ? { candidate } : {}), attributes: attrs, requestId: ctx.requestId })
            .pipe(Effect.tap((d) => Effect.sync(() => { self.lastDecision = d; if (d.effect === "allow" && !a.liveAttributes)
            self.cache.set(key, { decision: d, until: Math.min(Date.parse(d.expiresAt), Date.now() + 60_000) }); })));
    }
    /** Read gate: a denied record reads as not found (no existence disclosure, plan §9.1). */
    requireRead(action, r, ctx, current) {
        return this.decide(action, "read", r, ctx, current).pipe(Effect.flatMap((d) => (d.effect === "allow" ? Effect.void : Effect.fail(err("NotFound", `${r.name} ${String(current["id"])} not found`)))));
    }
    requireWrite(action, r, ctx, current, candidate) {
        return this.decide(action, "write", r, ctx, current ?? undefined, candidate).pipe(Effect.flatMap((d) => (d.effect === "allow" ? Effect.void : Effect.fail(current ? err("NotFound", `${r.name} ${String(current["id"])} not found`) : err("NotPermitted", d.reason ?? "not permitted")))));
    }
    /** Operation-level gate when no record is involved (creates without current state still pass the candidate). */
    requireOperation(action, r, ctx) {
        return this.decide(action, "operation", r, ctx).pipe(Effect.flatMap((d) => (d.effect === "allow" ? Effect.succeed(d) : Effect.fail(err("NotPermitted", d.reason ?? "not permitted")))));
    }
    /** List plan: `exact` when the policy predicate is on fields the query can express, else bounded candidate filtering. */
    listPlan(action, r, ctx, params) {
        if (!this.authorizer)
            return { kind: "none", filter: [] };
        if (this.authorizer.liveAttributes)
            return { kind: "candidate", filter: [] };
        const attrs = this.attributes(action, ctx.purpose, ctx.actor);
        const f = this.authorizer.rowFilterFor(action, ctx.purpose, attrs);
        if (f === null)
            return { kind: "candidate", filter: [] };
        if (f === "unsupported")
            return { kind: "unsupported", filter: [], reason: "policy predicate depends on attributes this runtime cannot resolve" };
        // Exact when every predicate field is a query parameter (the partition already restricts the working set)
        // or the predicate is on the record's own fields (checked per row within the bounded page: residual).
        const exact = f.filter.every((c) => c.field in params);
        return { kind: exact ? "exact" : "candidate", policy: f.policy, filter: f.filter };
    }
}
