/** Cloudflare Workers host: builds the runtime Layer from bindings per invocation. */
import { Effect, Layer } from "effect";
import { D1Storage } from "../adapters/d1.js";
import { R2ObjectStore } from "../adapters/r2.js";
import { Engine } from "../engine.js";
import { createHttpHandler, devHeaderAuth } from "../http.js";
import { Model } from "../model.js";
import { Dispatcher } from "../dispatch.js";
import { internalSubscriptions, withProjections } from "../readmodels.js";
import { SessionProtocol, upgradeAuthRequest } from "../realtime.js";
import { workersLogLine } from "../telemetry.js";
import { cloudflareQueuesTransport, decodeEnvelope } from "../transports.js";
import { Clock, CursorSecret, IdGen, Objects, Storage } from "../services.js";
import { productionIds } from "./ids.js";
import { MemoryObjectStore } from "../adapters/memory-objects.js";
function queueBindings(model, env) {
    const out = {};
    for (const s of model.bundle.messaging?.subscriptions ?? []) {
        const q = env[`Q_${s.name.toUpperCase().replace(/-/g, "_")}`];
        if (q)
            out[s.name] = q;
    }
    return out;
}
function nativeId(tenant, id) {
    return `${tenant}-${id}`.replace(/[^A-Za-z0-9_-]/g, "_").slice(0, 100);
}
/** Cloudflare Workflows drives instances: one native instance per Forge instance, `sendEvent` wakes waits. */
function cloudflareWorkflowDriver(model, env) {
    const plans = model.bundle.workflows?.workflows ?? [];
    if (!plans.length)
        return null;
    const binding = (wf) => env[plans.find((p) => p.id === wf.id)?.cloudflare.binding ?? ""];
    return {
        async started(tenant, wf, instanceId) {
            const b = binding(wf);
            if (!b)
                return; // no binding configured: the cron sweep remains the timer
            // Workflows instance ids: URL-safe, no colons.
            await b.create({ id: nativeId(tenant, instanceId), params: { tenant, id: instanceId } });
        },
        async wake(tenant, wf, inst) {
            const b = binding(wf);
            if (!b)
                return;
            try {
                const i = await b.get(nativeId(tenant, inst.id));
                await i.sendEvent({ type: "forge.wake", payload: { at: new Date().toISOString() } });
            }
            catch {
                // An instance that already finished (or never started natively) has nothing to wake.
            }
        },
    };
}
/** One Durable Object per (tenant, stream) holds the live sockets; the Worker posts frames to it. */
function cloudflareRealtimeHub(env) {
    if (!env.REALTIME)
        return null;
    const ns = env.REALTIME;
    return {
        async broadcast(tenant, channel, frame) {
            const stub = ns.get(ns.idFromName(`${tenant}|${channel}`));
            await stub.fetch("https://realtime/broadcast", { method: "POST", body: JSON.stringify(frame), headers: { "content-type": "application/json" } });
        },
    };
}
/**
 * The Durable Object body for realtime streams (`Base` is `DurableObject` from `cloudflare:workers`).
 * Uses the WebSocket hibernation API: sockets survive the object being evicted, their subscription
 * state lives in the socket attachment, and the session protocol is the shared one.
 */
export function createRealtimeObject(Base, bundle, options = {}) {
    const model = new Model(bundle);
    class ForgeRealtimeObject extends Base {
        engineFor(env) {
            const storage = new D1Storage(env.DB, model);
            const layer = Layer.mergeAll(Layer.succeed(Clock)({ now: () => new Date().toISOString() }), Layer.succeed(IdGen)(productionIds()), Layer.succeed(Storage)(storage), Layer.succeed(CursorSecret)({ key: env.CURSOR_SECRET }), Layer.succeed(Objects)(new MemoryObjectStore()));
            return new Engine(model, layer, options);
        }
        async fetch(request) {
            const self = this;
            const url = new URL(request.url);
            if (url.pathname === "/broadcast") {
                const frame = (await request.json());
                const text = JSON.stringify(frame);
                for (const ws of self.ctx.getWebSockets()) {
                    const att = ws.deserializeAttachment() ?? {};
                    if (att.streams?.includes(frame.stream)) {
                        try {
                            ws.send(text);
                        }
                        catch { /* closing socket: the client resumes by position */ }
                    }
                }
                return new Response(null, { status: 204 });
            }
            if (request.headers.get("upgrade")?.toLowerCase() !== "websocket")
                return new Response("expected websocket", { status: 426 });
            const tenant = request.headers.get("x-forge-tenant") ?? url.searchParams.get("tenant") ?? "";
            const pair = new globalThis.WebSocketPair();
            const [client, server] = [pair[0], pair[1]];
            server.serializeAttachment({ tenant, streams: [] });
            self.ctx.acceptWebSocket(server, [tenant]);
            return new Response(null, { status: 101, webSocket: client });
        }
        async webSocketMessage(ws, message) {
            const self = this;
            const sock = ws;
            const att = sock.deserializeAttachment();
            const session = new SessionProtocol(this.engineFor(self.env), att.tenant);
            session.restore(att.streams ?? []);
            const text = typeof message === "string" ? message : new TextDecoder().decode(message);
            const replies = await session.handle(text);
            sock.serializeAttachment({ tenant: att.tenant, streams: session.streams() });
            for (const r of replies)
                ws.send(JSON.stringify(r));
        }
        async webSocketClose(ws, code) {
            try {
                ws.close(code, "closed");
            }
            catch { /* already closed */ }
        }
    }
    return ForgeRealtimeObject;
}
/**
 * The WorkflowEntrypoint body for one Forge workflow: `run` loops the portable executor with
 * durable `step.do` calls, `step.sleep` for sleeps, and `step.waitForEvent` (bounded by the wait's
 * deadline) for waits. `Base` is `WorkflowEntrypoint` from `cloudflare:workers`, passed in so this
 * module stays importable outside the Workers runtime.
 */
export function createWorkflowEntrypoint(Base, bundle, options = {}) {
    const worker = createWorker(bundle, options);
    class ForgeWorkflowEntrypoint extends Base {
        async run(event, step) {
            const env = this.env;
            const { tenant, id } = event.payload;
            for (let n = 0; n < 10_000; n++) {
                const state = await step.do(`advance:${n}`, () => worker.advance(env, tenant, id));
                if (state.status === "sleeping") {
                    await step.sleep(`sleep:${n}`, Math.max(0, Date.parse(state.dueAt) - Date.now()));
                }
                else if (state.status === "waiting") {
                    const timeout = state.dueAt ? Math.max(1000, Date.parse(state.dueAt) - Date.now()) : 365 * 24 * 3600 * 1000;
                    try {
                        await step.waitForEvent(`wait:${n}`, { type: "forge.wake", timeout });
                    }
                    catch {
                        // Deadline reached: the next advance applies the timeout terminal (or a late signal already consumed).
                    }
                }
                else if (state.status === "running") {
                    // Another driver may own a mapped child lease. Yield before polling again.
                    await step.sleep(`retry:${n}`, 1000);
                }
                else {
                    return state;
                }
            }
            return null;
        }
    }
    return ForgeWorkflowEntrypoint;
}
export function createWorker(bundle, options = {}) {
    const model = new Model(bundle);
    const subscriptions = {};
    for (const s of model.bundle.messaging?.subscriptions ?? [])
        (subscriptions[s.channel] ??= []).push(s.name);
    const build = (env, baseUrl) => {
        const objects = env.BLOBS ? new R2ObjectStore(env.BLOBS, { baseUrl, secret: env.CURSOR_SECRET }) : null;
        const storage = new D1Storage(env.DB, model);
        const layer = Layer.mergeAll(Layer.succeed(Clock)({ now: () => new Date().toISOString() }), Layer.succeed(IdGen)(productionIds()), Layer.succeed(Storage)(storage), Layer.succeed(CursorSecret)({ key: env.CURSOR_SECRET }), Layer.succeed(Objects)(objects ?? new MemoryObjectStore()));
        const engine = new Engine(model, layer, options);
        engine.workflows.driver = cloudflareWorkflowDriver(model, env);
        engine.realtime.hub = cloudflareRealtimeHub(env);
        // Workers Logs: structured JSON per operation event (plan §20; metrics are derived downstream).
        engine.telemetry.target = "cloudflare-d1";
        engine.telemetry.sink = { write: (e) => console.log(workersLogLine(e)) };
        const dispatcher = new Dispatcher(model, storage, withProjections(engine, cloudflareQueuesTransport(queueBindings(model, env))), { subscriptions: internalSubscriptions(engine, subscriptions), leaseMs: 30_000, maxAttempts: 8 });
        return { engine, storage, objects, dispatcher };
    };
    return {
        /** One driver step for the Workflows entrypoint: advance and report where the instance parked. */
        async advance(env, tenant, id) {
            const { engine } = build(env, "https://workflow.invalid");
            const st = await Effect.runPromise(engine.workflows.advance(tenant, id).pipe(Effect.provide(engine.layer)));
            const dueAt = (st["sleeping"]?.dueAt ?? st["waiting"]?.dueAt);
            return { status: st["status"], ...(dueAt ? { dueAt } : {}) };
        },
        /** Cron trigger: the durable outbox sweep (plan §14: waitUntil nudges are not a delivery guarantee). */
        async scheduled(event, env, ctx) {
            const { storage, dispatcher, engine } = build(env, "https://scheduled.invalid");
            const tenants = await Effect.runPromise(storage.outboxTenants());
            // Schedules (plan §19): the trigger's scheduledTime is the intended instant; the ledger decides what is due.
            const ev = (event ?? {});
            const now = new Date(ev.scheduledTime ?? Date.now()).toISOString();
            ctx.waitUntil(Promise.all(tenants.map((t) => Effect.runPromise(engine.schedules.tick(t, now)))));
            ctx.waitUntil(Promise.all(tenants.map((t) => Effect.runPromise(dispatcher.sweep(t, { now: Date.now() })))));
            // Crashed `running` instances resume here; native drivers own timers.
            ctx.waitUntil(Promise.all(tenants.map((t) => Effect.runPromise(engine.workflows.sweep(t)))));
        },
        /** Queue consumer: every message is a forge envelope for exactly one subscription (the queue's). */
        async queue(batch, env) {
            const { engine } = build(env, "https://queue.invalid");
            const sub = (model.bundle.messaging?.subscriptions ?? []).find((s) => s.queue === batch.queue);
            for (const m of batch.messages) {
                if (!sub) {
                    m.ack();
                    continue;
                }
                try {
                    await engine.consume(sub.name, decodeEnvelope(m.body));
                    m.ack();
                }
                catch (e) {
                    console.error("forge: consumer failed", sub.name, e);
                    m.retry();
                }
            }
        },
        async fetch(request, env, ctx) {
            const auth = options.auth ?? (env.FORGE_AUTH === "dev-headers" ? devHeaderAuth() : null);
            if (auth?.scheme === "dev-header")
                console.warn("forge: DEVELOPMENT AUTH ACTIVE — x-forge-tenant/x-forge-actor headers are trusted verbatim. Never expose this deployment to untrusted callers.");
            if (!auth)
                return new Response(JSON.stringify({ code: "Unauthenticated", detail: "no authentication host configured (set FORGE_AUTH=dev-headers for development)" }), { status: 401, headers: { "content-type": "application/problem+json" } });
            const url = new URL(request.url);
            const { engine, objects, dispatcher } = build(env, `${url.protocol}//${url.host}`);
            // Realtime upgrade: authenticate (query-string headers for browsers), then hand the socket to the stream's object.
            if (request.headers.get("upgrade")?.toLowerCase() === "websocket") {
                const stream = engine.realtime.streamByPath(url.pathname);
                if (!stream || !env.REALTIME)
                    return new Response("no such stream", { status: 404 });
                const principal = await auth.authenticate(upgradeAuthRequest(url, request.headers));
                if (!("tenant" in principal))
                    return new Response(JSON.stringify(principal.problem(crypto.randomUUID())), { status: 401, headers: { "content-type": "application/problem+json" } });
                const stub = env.REALTIME.get(env.REALTIME.idFromName(`${principal.tenant}|${stream.channel}`));
                const forwarded = new Request(request.url, request);
                forwarded.headers.set("x-forge-tenant", principal.tenant);
                forwarded.headers.set("x-forge-actor", principal.actor);
                return stub.fetch(forwarded);
            }
            // Object bytes: the Worker-served equivalent of presigned URLs (bearer token, one key, one method).
            const m = /^\/_forge\/objects\/([^/]+)$/.exec(url.pathname);
            if (m && objects)
                return objects.serve(request, m[1]);
            const handler = createHttpHandler(model, engine, { auth, requestId: (req) => req.headers.get("cf-ray") ?? crypto.randomUUID(), ...(env.FORGE_CORS ? { cors: { origins: env.FORGE_CORS.split(",") } } : {}) });
            const res = await handler(request);
            // Prompt post-commit nudge for this tenant; the cron sweep is the guarantee.
            if (ctx && request.method !== "GET" && res.status < 300) {
                const tenant = request.headers.get("x-forge-tenant");
                if (tenant)
                    ctx.waitUntil(Effect.runPromise(dispatcher.sweep(tenant, { now: Date.now() })).catch(() => undefined));
            }
            return res;
        },
    };
}
