/** SLI classification policy from the plan (§20): declared domain errors are business outcomes, not failures. */
export function classify(status, code) {
    if (status < 400)
        return "good";
    if (code && code.includes("/"))
        return "business";
    if (code === "TransientConflict" || status >= 500)
        return "bad";
    return "excluded";
}
const DIMENSIONS = ["forge.operation", "forge.kind", "forge.resource", "forge.outcome", "forge.target", "forge.purpose", "forge.decision"];
export class Telemetry {
    engine;
    sink = null;
    target = "runtime-memory";
    /** Purpose handling overrides (purpose id -> handling); `confidential`/`restricted` purposes are emitted as opaque handles. */
    purposeHandling = {};
    /** Grant epoch supplied by the host (registry snapshot); 0 when no grants are in force. */
    grantEpoch = 0;
    seq = 0;
    emitted = 0;
    dropped = 0;
    constructor(engine) {
        this.engine = engine;
    }
    /** Stable, bounded purpose label: the id, or an HMAC-free hash handle when the name itself is sensitive (PAR-165). */
    purposeLabel(purpose) {
        if (!purpose)
            return undefined;
        const handling = this.purposeHandling[purpose] ?? this.engine.model.purposes.find((p) => p.id === purpose && p.handling)?.["handling"];
        if (handling === "confidential" || handling === "restricted")
            return `p:${fnv(purpose).slice(0, 12)}`;
        return purpose;
    }
    governance(operation, ctx, code) {
        const out = {};
        const purpose = this.purposeLabel(ctx.purpose);
        if (purpose)
            out.purpose = purpose;
        const ref = this.engine.model.operation(operation);
        const surface = ref && ctx.purpose ? this.engine.scope.surface(ref.resource.id, ctx.purpose) : null;
        if (surface)
            out.surface = surface.digest.slice(0, 12);
        // The decision the call path took: a scope or authorizer refusal is `deny`; a scoped or authorized call is `allow`;
        // maintenance and unscoped calls without an authorizer took no decision.
        const gated = Boolean(surface) || Boolean(this.engine.gatekeeper.authorizer && !ctx.maintenance);
        out.decision = code === "NotPermitted" ? "deny" : gated ? "allow" : "none";
        out.policyEpoch = this.engine.gatekeeper.authorizer?.epoch ?? 0;
        if (this.grantEpoch)
            out.grantEpoch = this.grantEpoch;
        return out;
    }
    /** Plan entry for an operation id; unknown ids (internal ops) still get a generic entry. */
    entry(operation) {
        const plan = this.engine.model.bundle.observability?.operations.find((o) => o.operation === operation);
        if (plan)
            return { kind: plan.kind, ...(plan.resource ? { resource: plan.resource } : {}) };
        const ref = this.engine.model.operation(operation);
        if (ref)
            return { kind: ref.op.kind, resource: ref.resource.id };
        return { kind: operation.slice(operation.lastIndexOf(".") + 1) };
    }
    emit(operation, ctx, startedAt, status, code) {
        this.write(operation, ctx, Math.round((performance.now() - startedAt) * 1000) / 1000, status, code, "completion");
    }
    /** A retried try that did not complete the logical request (PAR-166): same requestId, next attempt number. */
    attempt(ctx, status, code, operation = "retry") {
        const n = (this.attempts.get(ctx.requestId) ?? 0) + 1;
        this.attempts.set(ctx.requestId, n);
        if (this.attempts.size > 10_000)
            this.attempts.delete(this.attempts.keys().next().value);
        this.write(operation, { ...ctx, attempt: n }, 0, status, code, "attempt");
    }
    attempts = new Map();
    write(operation, ctx, durationMs, status, code, phase) {
        const { kind, resource } = this.entry(operation);
        const ref = this.engine.model.operation(operation);
        const semanticAnchor = ref ? `${ref.resource.id}#op:${operation.slice(ref.resource.id.length + 1)}` : this.engine.model.functions.some(f => f.id === operation) ? operation : undefined;
        const ev = {
            ts: new Date().toISOString(),
            seq: ++this.seq,
            operation,
            buildHash: this.engine.model.bundle.buildHash,
            ...(semanticAnchor ? { semanticAnchor } : {}),
            kind,
            ...(resource ? { resource } : {}),
            outcome: classify(status, code),
            status,
            ...(code ? { code } : {}),
            durationMs,
            logical: true,
            attempt: ctx.attempt ?? (phase === "completion" ? Math.max(1, this.attempts.get(ctx.requestId) ?? 0) : 1),
            phase,
            requestId: ctx.requestId,
            target: this.target,
            ...(ctx.trace ? { trace: ctx.trace } : {}),
            ...this.governance(operation, ctx, code),
        };
        if (phase === "completion")
            this.attempts.delete(ctx.requestId);
        this.emitted++;
        try {
            this.sink?.write(ev);
        }
        catch {
            this.dropped++; // export gap: counted, never thrown into the operation
        }
    }
    /** SLI denominators: completions are requests; attempts are counted separately; export loss is coverage, not error. */
    sli(events) {
        const completions = events.filter((e) => e.phase === "completion");
        return {
            requests: completions.length,
            good: completions.filter((e) => e.outcome === "good").length,
            bad: completions.filter((e) => e.outcome === "bad").length,
            business: completions.filter((e) => e.outcome === "business").length,
            excluded: completions.filter((e) => e.outcome === "excluded").length,
            attempts: events.length,
            transportFailures: events.filter((e) => e.code === "TransportFailed").length,
            coverage: { emitted: this.emitted, dropped: this.dropped },
        };
    }
    /** Bounded metric dimensions only. */
    dimensions(e) {
        const out = {};
        for (const d of DIMENSIONS) {
            const v = d === "forge.operation" ? e.operation : d === "forge.kind" ? e.kind : d === "forge.resource" ? (e.resource ?? "") : d === "forge.outcome" ? e.outcome : d === "forge.purpose" ? (e.purpose ?? "") : d === "forge.decision" ? (e.decision ?? "") : e.target;
            if (v)
                out[d] = v;
        }
        return out;
    }
    stats() {
        return { emitted: this.emitted, dropped: this.dropped, seq: this.seq };
    }
}
/** Small stable hash for opaque handles (not a secret: the handle hides the name from casual readers, access control hides it from the rest). */
function fnv(s) {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
        h ^= s.charCodeAt(i);
        h = Math.imul(h, 0x01000193) >>> 0;
    }
    let h2 = 0x01000193;
    for (let i = s.length - 1; i >= 0; i--) {
        h2 ^= s.charCodeAt(i);
        h2 = Math.imul(h2, 0x811c9dc5) >>> 0;
    }
    return h.toString(16).padStart(8, "0") + h2.toString(16).padStart(8, "0");
}
// ------------------------------------------------------------ trace context
const HEX16 = () => Array.from(crypto.getRandomValues(new Uint8Array(8)), (b) => b.toString(16).padStart(2, "0")).join("");
const HEX32 = () => Array.from(crypto.getRandomValues(new Uint8Array(16)), (b) => b.toString(16).padStart(2, "0")).join("");
/** Parse an incoming W3C `traceparent` and start a child span; without one, start a new trace. */
export function spanFromTraceparent(header) {
    const m = header && /^00-([0-9a-f]{32})-([0-9a-f]{16})-[0-9a-f]{2}$/i.exec(header.trim());
    if (m)
        return { traceId: m[1].toLowerCase(), spanId: HEX16(), parentSpanId: m[2].toLowerCase() };
    return { traceId: HEX32(), spanId: HEX16() };
}
export function traceparent(t) {
    return `00-${t.traceId}-${t.spanId}-01`;
}
// ------------------------------------------------------------- host sinks
/** Workers Logs: one structured JSON line per event. */
export function workersLogLine(e) {
    return JSON.stringify({ forge: "operation", ...e });
}
/** CloudWatch Embedded Metric Format: count + duration histogram with bounded dimensions. */
export function emfLine(e, namespace) {
    return JSON.stringify({
        _aws: {
            Timestamp: Date.parse(e.ts),
            CloudWatchMetrics: [{ Namespace: namespace, Dimensions: [["forge.operation", "forge.outcome"]], Metrics: [{ Name: "forge.operation.count", Unit: "Count" }, { Name: "forge.operation.duration_ms", Unit: "Milliseconds" }] }],
        },
        "forge.operation": e.operation,
        "forge.outcome": e.outcome,
        "forge.operation.count": 1,
        "forge.operation.duration_ms": e.durationMs,
        "forge.kind": e.kind,
        ...(e.resource ? { "forge.resource": e.resource } : {}),
        "forge.target": e.target,
        status: e.status,
        ...(e.code ? { code: e.code } : {}),
        requestId: e.requestId,
        seq: e.seq,
        ...(e.trace ? { traceId: e.trace.traceId, spanId: e.trace.spanId } : {}),
    });
}
