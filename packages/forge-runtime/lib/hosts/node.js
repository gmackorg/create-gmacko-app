/**
 * Node host (FORGE-035, plan §5.4): the same Effect runtime behind a
 * Fetch-compatible HTTP server, an in-process WebSocket realtime hub, a
 * periodic durable sweep (outbox, crashed workflows, schedules), readiness/
 * liveness probes, bounded concurrency with 503 on overflow, and graceful
 * drain: on `stop()` the listener closes, in-flight requests finish, the sweep
 * completes its current pass and pending timers are cancelled. Durable state
 * (outbox rows, workflow instances, schedule ledgers) lives in the store, so
 * a restart resumes acknowledged work instead of losing it.
 */
import { createServer } from "node:http";
import { Readable } from "node:stream";
import { WebSocketServer } from "ws";
import { R2ObjectStore } from "../adapters/r2.js";
import { FsBucket } from "../adapters/fs-objects.js";
import { createHttpHandler, devHeaderAuth } from "../http.js";
import { SessionProtocol, upgradeAuthRequest } from "../realtime.js";
import { emfLine, workersLogLine } from "../telemetry.js";
import { OtlpSink } from "../otlp.js";
import { composeRuntime } from "./compose.js";
/** Node request → Fetch Request. */
export function toFetchRequest(req, base) {
    const url = new URL(req.url ?? "/", base);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
        if (v === undefined)
            continue;
        headers.set(k, Array.isArray(v) ? v.join(", ") : v);
    }
    const method = req.method ?? "GET";
    const body = method === "GET" || method === "HEAD" ? null : Readable.toWeb(req);
    return new Request(url, { method, headers, body, ...(body ? { duplex: "half" } : {}) });
}
export async function writeFetchResponse(res, r) {
    res.statusCode = r.status;
    r.headers.forEach((v, k) => res.setHeader(k, v));
    if (!r.body)
        return void res.end();
    for await (const chunk of r.body)
        res.write(chunk);
    res.end();
}
export function createNodeHost(options) {
    const sessions = new Map();
    const hub = {
        async broadcast(tenant, channel, frame) {
            const text = JSON.stringify(frame);
            for (const [ws, s] of sessions)
                if (s.session.accepts(tenant, channel)) {
                    try {
                        ws.send(text);
                    }
                    catch { /* closing */ }
                }
        },
    };
    const format = options.telemetryFormat ?? "json";
    const otlp = format === "otlp" && options.otlp ? new OtlpSink({ ...options.otlp, serviceName: options.otlp.serviceName ?? `forge/${options.bundle.ir.package.name}`, boundaries: Object.fromEntries((options.bundle.observability?.operations ?? []).map((o) => [o.operation, o.histogramBoundariesMs])) }) : null;
    const sink = options.telemetrySink
        ? { write: options.telemetrySink }
        : otlp ? otlp : format === "silent" ? { write: () => undefined } : { write: (e) => console.log(format === "emf" ? emfLine(e, `forge/${options.bundle.ir.package.name}`) : workersLogLine(e)) };
    // Signed object URLs must name the address clients reach; with `objects: { directory }` the host serves them itself.
    let publicUrl = options.publicUrl ?? "http://localhost";
    const fsStore = options.objects && "directory" in options.objects ? new R2ObjectStore(new FsBucket(options.objects.directory), { get baseUrl() { return publicUrl; }, secret: options.cursorSecret }) : null;
    const objects = fsStore ?? options.objects;
    const { objects: _o, publicUrl: _p, ...composition } = options;
    void _o;
    void _p;
    const runtime = composeRuntime({ ...composition, ...(objects ? { objects } : {}), realtimeHub: hub, telemetry: { sink, target: "node-postgres" } });
    const auth = options.auth ?? (process.env["FORGE_AUTH"] === "dev-headers" ? devHeaderAuth() : null);
    if (!auth) {
        throw new Error("createNodeHost: no authentication host configured. Pass `auth` (for example jwtAuth({ issuer, audience, secret, claims })), " +
            "or set FORGE_AUTH=dev-headers to trust x-forge-tenant/x-forge-actor headers — development only, never in a deployment.");
    }
    if (auth.scheme === "dev-header")
        console.warn("forge: DEVELOPMENT AUTH ACTIVE — x-forge-tenant/x-forge-actor headers are trusted verbatim. Never run this configuration where untrusted callers can reach it.");
    const handler = createHttpHandler(runtime.model, runtime.engine, { auth, requestId: () => crypto.randomUUID(), ...(options.cors ? { cors: { origins: options.cors } } : {}) });
    const maxInFlight = options.maxInFlight ?? 256;
    let inFlight = 0;
    let stopping = false;
    const host = { runtime, server: undefined, ready: false, address: () => bound, listen, stop };
    let bound = null;
    let sweepTimer = null;
    let sweeping = null;
    const drained = new Set();
    const server = createServer(async (req, res) => {
        const base = bound?.url ?? "http://localhost";
        const path = new URL(req.url ?? "/", base).pathname;
        if (path === "/healthz")
            return void res.writeHead(200, { "content-type": "application/json" }).end(JSON.stringify({ ok: true }));
        const obj = fsStore && /^\/_forge\/objects\/([^/]+)$/.exec(path);
        if (obj) {
            inFlight++;
            try {
                await writeFetchResponse(res, await fsStore.serve(toFetchRequest(req, base), obj[1]));
            }
            finally {
                inFlight--;
                if (inFlight === 0)
                    for (const f of drained)
                        f();
            }
            return;
        }
        if (path === "/readyz")
            return void res.writeHead(host.ready && !stopping ? 200 : 503, { "content-type": "application/json" }).end(JSON.stringify({ ready: host.ready && !stopping, inFlight, telemetry: runtime.engine.telemetry.stats() }));
        if (stopping)
            return void res.writeHead(503, { connection: "close", "retry-after": "1" }).end();
        if (inFlight >= maxInFlight)
            return void res.writeHead(503, { "retry-after": "1", "content-type": "application/problem+json" }).end(JSON.stringify({ code: "Overloaded", status: 503, retryable: true }));
        inFlight++;
        try {
            const request = toFetchRequest(req, base);
            const response = await handler(request);
            await writeFetchResponse(res, response);
            // Prompt post-commit nudge; the periodic sweep is the guarantee.
            const tenant = request.headers.get("x-forge-tenant");
            if (tenant && request.method !== "GET" && response.status < 300)
                void runtime.sweep(tenant).catch(() => undefined);
        }
        catch (e) {
            if (!res.headersSent)
                res.writeHead(500, { "content-type": "application/problem+json" });
            res.end(JSON.stringify({ code: "Internal", status: 500, detail: String(e.message ?? e) }));
        }
        finally {
            inFlight--;
            if (inFlight === 0)
                for (const f of drained)
                    f();
        }
    });
    host.server = server;
    // Realtime: upgrade on a stream path, query-string auth, shared session protocol.
    const wss = new WebSocketServer({ noServer: true });
    server.on("upgrade", async (req, socket, head) => {
        const url = new URL(req.url ?? "/", bound?.url ?? "http://localhost");
        const stream = runtime.engine.realtime.streamByPath(url.pathname);
        if (!stream || stopping)
            return void socket.destroy();
        const headers = new Headers();
        for (const [k, v] of Object.entries(req.headers))
            if (typeof v === "string")
                headers.set(k, v);
        const principal = await auth.authenticate(upgradeAuthRequest(url, headers));
        if (!("tenant" in principal))
            return void socket.destroy();
        wss.handleUpgrade(req, socket, head, (ws) => {
            const session = new SessionProtocol(runtime.engine, principal.tenant);
            sessions.set(ws, { tenant: principal.tenant, session });
            ws.on("message", async (data) => {
                const replies = await session.handle(data.toString());
                for (const r of replies)
                    ws.send(JSON.stringify(r));
            });
            ws.on("close", () => sessions.delete(ws));
        });
    });
    async function listen(port = 0, hostName = "127.0.0.1") {
        await new Promise((resolve, reject) => server.once("error", reject).listen(port, hostName, () => resolve()));
        const a = server.address();
        bound = { port: a.port, url: `http://${hostName}:${a.port}` };
        if (!options.publicUrl)
            publicUrl = bound.url;
        host.ready = true;
        const period = options.sweepIntervalMs ?? 5_000;
        if (period > 0) {
            const tick = () => {
                if (stopping)
                    return;
                sweeping = runtime.sweepAll().catch(() => undefined).finally(() => { sweeping = null; });
            };
            sweepTimer = setInterval(tick, period);
            sweepTimer.unref();
        }
        return bound;
    }
    async function stop() {
        stopping = true;
        host.ready = false;
        if (sweepTimer)
            clearInterval(sweepTimer);
        for (const ws of sessions.keys())
            ws.close(1001, "shutting down");
        await new Promise((resolve) => server.close(() => resolve()));
        if (inFlight > 0)
            await new Promise((resolve) => drained.add(resolve));
        if (sweeping)
            await sweeping;
        if (otlp)
            await otlp.flush(); // drain telemetry with the requests
    }
    return host;
}
