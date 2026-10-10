const ATTRS = ["operation", "kind", "resource", "outcome", "target", "purpose", "decision", "phase"];
const DEFAULT_BOUNDS = [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000, 10000];
const attrs = (e) => {
    const out = [];
    for (const k of ATTRS) {
        const v = e[k];
        if (v !== undefined && v !== "")
            out.push({ key: `forge.${k}`, value: { stringValue: String(v) } });
    }
    out.push({ key: "forge.status", value: { intValue: String(e.status) } });
    if (e.code)
        out.push({ key: "forge.code", value: { stringValue: e.code } });
    if (e.policyEpoch !== undefined)
        out.push({ key: "forge.policy_epoch", value: { intValue: String(e.policyEpoch) } });
    return out;
};
export class OtlpSink {
    o;
    batch = [];
    timer = null;
    exported = 0;
    dropped = 0;
    inflight = null;
    constructor(o) {
        this.o = o;
    }
    write(e) {
        this.batch.push(e);
        if (this.batch.length >= (this.o.maxBatch ?? 100))
            void this.flush();
        else if (!this.timer) {
            this.timer = setTimeout(() => void this.flush(), this.o.flushIntervalMs ?? 1000);
            this.timer.unref?.();
        }
    }
    stats() {
        return { exported: this.exported, dropped: this.dropped, pending: this.batch.length };
    }
    /** OTLP payloads for a batch (exposed for tests and for hosts that ship their own transport). */
    payloads(events) {
        const resource = { attributes: [{ key: "service.name", value: { stringValue: this.o.serviceName } }, { key: "telemetry.sdk.name", value: { stringValue: "forge" } }] };
        const nano = (iso) => String(BigInt(Date.parse(iso)) * 1000000n);
        const logRecords = events.map((e) => ({
            timeUnixNano: nano(e.ts),
            severityNumber: e.outcome === "bad" ? 17 : e.outcome === "business" ? 13 : 9,
            severityText: e.outcome === "bad" ? "ERROR" : e.outcome === "business" ? "WARN" : "INFO",
            body: { stringValue: `${e.operation} ${e.outcome} ${e.status}` },
            attributes: [...attrs(e), { key: "forge.request_id", value: { stringValue: e.requestId } }, { key: "forge.attempt", value: { intValue: String(e.attempt) } }],
            ...(e.trace ? { traceId: e.trace.traceId, spanId: e.trace.spanId } : {}),
        }));
        // metrics: one data point per distinct attribute set in the batch
        const groups = new Map();
        for (const e of events) {
            const a = attrs(e).filter((x) => x.key !== "forge.status" && x.key !== "forge.code" && x.key !== "forge.policy_epoch");
            const key = a.map((x) => `${x.key}=${JSON.stringify(x.value)}`).join("|");
            const g = groups.get(key) ?? { attributes: a, events: [] };
            g.events.push(e);
            groups.set(key, g);
        }
        const now = nano(new Date().toISOString());
        const completions = [...groups.values()].map((g) => ({ attributes: g.attributes, timeUnixNano: now, asInt: String(g.events.filter((e) => e.phase === "completion").length) })).filter((p) => p.asInt !== "0");
        const attempts = [...groups.values()].map((g) => ({ attributes: g.attributes, timeUnixNano: now, asInt: String(g.events.length) }));
        const histogram = [...groups.values()].filter((g) => g.events.some((e) => e.phase === "completion")).map((g) => {
            const op = g.events[0].operation;
            const bounds = this.o.boundaries?.[op] ?? DEFAULT_BOUNDS;
            const counts = new Array(bounds.length + 1).fill(0);
            let sum = 0;
            const done = g.events.filter((e) => e.phase === "completion");
            for (const e of done) {
                sum += e.durationMs;
                let i = bounds.findIndex((b) => e.durationMs <= b);
                if (i < 0)
                    i = bounds.length;
                counts[i]++;
            }
            return { attributes: g.attributes, timeUnixNano: now, count: String(done.length), sum, bucketCounts: counts.map(String), explicitBounds: bounds };
        });
        const metrics = [
            { name: "forge_requests_total", description: "logical operations completed (attempts excluded)", unit: "1", sum: { aggregationTemporality: 1, isMonotonic: true, dataPoints: completions } },
            { name: "forge_attempts_total", description: "tries including retries", unit: "1", sum: { aggregationTemporality: 1, isMonotonic: true, dataPoints: attempts } },
            { name: "forge_request_duration_ms", description: "completion latency with the plan's buckets", unit: "ms", histogram: { aggregationTemporality: 1, dataPoints: histogram } },
            { name: "forge_telemetry_dropped_total", description: "events lost at export", unit: "1", sum: { aggregationTemporality: 2, isMonotonic: true, dataPoints: [{ attributes: [], timeUnixNano: now, asInt: String(this.dropped) }] } },
        ];
        return { logs: { resourceLogs: [{ resource, scopeLogs: [{ scope: { name: "forge" }, logRecords }] }] }, metrics: { resourceMetrics: [{ resource, scopeMetrics: [{ scope: { name: "forge" }, metrics }] }] } };
    }
    async flush() {
        if (this.timer) {
            clearTimeout(this.timer);
            this.timer = null;
        }
        if (this.inflight)
            await this.inflight;
        const events = this.batch;
        if (events.length === 0)
            return;
        this.batch = [];
        const f = this.o.fetch ?? fetch;
        const { logs, metrics } = this.payloads(events);
        const headers = { "content-type": "application/json", ...(this.o.headers ?? {}) };
        this.inflight = (async () => {
            try {
                const [l, m] = await Promise.all([f(`${this.o.endpoint.replace(/\/$/, "")}/v1/logs`, { method: "POST", headers, body: JSON.stringify(logs) }), f(`${this.o.endpoint.replace(/\/$/, "")}/v1/metrics`, { method: "POST", headers, body: JSON.stringify(metrics) })]);
                if (l.ok && m.ok)
                    this.exported += events.length;
                else
                    this.dropped += events.length;
            }
            catch {
                this.dropped += events.length; // loss is counted, never thrown into an operation
            }
            finally {
                this.inflight = null;
            }
        })();
        await this.inflight;
    }
}
