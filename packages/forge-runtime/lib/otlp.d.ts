/**
 * OTLP/HTTP (JSON) exporter sink (closes SR-6). Turns OperationEvents into
 * OpenTelemetry log records and metrics — a request counter, an attempt
 * counter and a duration histogram with the plan's exact bucket boundaries —
 * with the same bounded attribute set the other sinks use (never tenant,
 * actor, ids or inputs). Export is batched and asynchronous; a failed export
 * is counted as loss (`stats().dropped`) and never surfaces into the
 * operation. Trace context rides along as `traceId`/`spanId` on log records.
 */
import type { OperationEvent, TelemetrySink } from "./telemetry.js";
export interface OtlpOptions {
    /** Base endpoint, e.g. http://collector:4318 ; `/v1/logs` and `/v1/metrics` are appended. */
    endpoint: string;
    headers?: Record<string, string>;
    serviceName: string;
    /** Histogram boundaries (ms) by operation id, from the observability plan. */
    boundaries?: Record<string, number[]>;
    flushIntervalMs?: number;
    maxBatch?: number;
    fetch?: typeof fetch;
}
export declare class OtlpSink implements TelemetrySink {
    private readonly o;
    private batch;
    private timer;
    private exported;
    private dropped;
    private inflight;
    constructor(o: OtlpOptions);
    write(e: OperationEvent): void;
    stats(): {
        exported: number;
        dropped: number;
        pending: number;
    };
    /** OTLP payloads for a batch (exposed for tests and for hosts that ship their own transport). */
    payloads(events: OperationEvent[]): {
        logs: unknown;
        metrics: unknown;
    };
    flush(): Promise<void>;
}
