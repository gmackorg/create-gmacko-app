/**
 * Telemetry (plan §20). One unsampled operation event per logical operation,
 * classified by the compiled observability plan: `good`, `excluded` (client
 * errors that do not count against availability), `bad` (failures that do),
 * `business` (declared domain errors: served correctly, counted separately).
 * Dimensions are bounded to the plan's list; tenant, ids and inputs never
 * become labels. A per-process sequence number makes export gaps visible:
 * `stats()` reports emitted vs dropped.
 */
import type { CallContext, Engine } from "./engine.js";
export type Outcome = "good" | "excluded" | "bad" | "business";
export interface TraceContext {
    traceId: string;
    spanId: string;
    parentSpanId?: string;
}
export interface OperationEvent {
    ts: string;
    seq: number;
    operation: string;
    /** Artifact identity and source-map anchor, excluded from metric dimensions. */
    buildHash?: string;
    semanticAnchor?: string;
    kind: string;
    resource?: string;
    outcome: Outcome;
    status: number;
    code?: string;
    durationMs: number;
    /** One per logical operation; retries increment `attempt` on the same logical event. */
    logical: true;
    attempt: number;
    /** `completion` is the one event per logical request; `attempt` events are retried tries that did not complete it. */
    phase: "attempt" | "completion";
    requestId: string;
    target: string;
    trace?: TraceContext;
    /** Purpose id, or an opaque stable handle (`p:<12 hex>`) when the purpose's handling is confidential (PAR-165). */
    purpose?: string;
    /** Capability surface digest (12 hex) the call was projected through. */
    surface?: string;
    /** Last authorizer decision on the call path: allow | deny | none (no authorizer / maintenance). */
    decision?: "allow" | "deny" | "none";
    policyEpoch?: number;
    grantEpoch?: number;
}
export interface TelemetrySink {
    write(e: OperationEvent): void;
}
/** SLI classification policy from the plan (§20): declared domain errors are business outcomes, not failures. */
export declare function classify(status: number, code?: string): Outcome;
export interface SliSummary {
    requests: number;
    good: number;
    bad: number;
    business: number;
    excluded: number;
    attempts: number;
    transportFailures: number;
    coverage: {
        emitted: number;
        dropped: number;
    };
}
export declare class Telemetry {
    private readonly engine;
    sink: TelemetrySink | null;
    target: string;
    /** Purpose handling overrides (purpose id -> handling); `confidential`/`restricted` purposes are emitted as opaque handles. */
    purposeHandling: Record<string, string>;
    /** Grant epoch supplied by the host (registry snapshot); 0 when no grants are in force. */
    grantEpoch: number;
    private seq;
    private emitted;
    private dropped;
    constructor(engine: Engine);
    /** Stable, bounded purpose label: the id, or an HMAC-free hash handle when the name itself is sensitive (PAR-165). */
    purposeLabel(purpose: string | undefined): string | undefined;
    private governance;
    /** Plan entry for an operation id; unknown ids (internal ops) still get a generic entry. */
    entry(operation: string): {
        kind: string;
        resource?: string;
    };
    emit(operation: string, ctx: CallContext, startedAt: number, status: number, code?: string): void;
    /** A retried try that did not complete the logical request (PAR-166): same requestId, next attempt number. */
    attempt(ctx: CallContext, status: number, code?: string, operation?: string): void;
    private readonly attempts;
    private write;
    /** SLI denominators: completions are requests; attempts are counted separately; export loss is coverage, not error. */
    sli(events: OperationEvent[]): SliSummary;
    /** Bounded metric dimensions only. */
    dimensions(e: OperationEvent): Record<string, string>;
    stats(): {
        emitted: number;
        dropped: number;
        seq: number;
    };
}
/** Parse an incoming W3C `traceparent` and start a child span; without one, start a new trace. */
export declare function spanFromTraceparent(header: string | null): TraceContext;
export declare function traceparent(t: TraceContext): string;
/** Workers Logs: one structured JSON line per event. */
export declare function workersLogLine(e: OperationEvent): string;
/** CloudWatch Embedded Metric Format: count + duration histogram with bounded dimensions. */
export declare function emfLine(e: OperationEvent, namespace: string): string;
