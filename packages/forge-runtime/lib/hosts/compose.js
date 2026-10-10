/**
 * Composable runtime (FORGE-032, plan §5.1). A deployment is a choice on each
 * axis — structured store, object store, channel transport, workflow driver,
 * realtime hub, clock/ids/secret — not a provider bundle. The Cloudflare and
 * AWS hosts are compositions of these; the Node host is another. Each axis is
 * a named capability interface; nothing here is a generic get/put client.
 */
import { Effect, Layer } from "effect";
import { MemoryObjectStore } from "../adapters/memory-objects.js";
import { Dispatcher } from "../dispatch.js";
import { Engine } from "../engine.js";
import { Model } from "../model.js";
import { internalSubscriptions, withProjections } from "../readmodels.js";
import { Clock, CursorSecret, IdGen, Objects, Storage } from "../services.js";
import { productionIds } from "./ids.js";
export function composeRuntime(c) {
    const model = new Model(c.bundle);
    const layer = Layer.mergeAll(Layer.succeed(Clock)({ now: c.clock ?? (() => new Date().toISOString()) }), Layer.succeed(IdGen)(productionIds()), Layer.succeed(Storage)(c.store), Layer.succeed(CursorSecret)({ key: c.cursorSecret }), Layer.succeed(Objects)(c.objects ?? new MemoryObjectStore()));
    const engine = new Engine(model, layer, { ...(c.secrets ? { secrets: c.secrets } : {}), ...(c.functions ? { functions: c.functions } : {}), ...(c.externals ? { externals: c.externals } : {}) });
    if (c.workflowDriver)
        engine.workflows.driver = c.workflowDriver;
    if (c.realtimeHub)
        engine.realtime.hub = c.realtimeHub;
    if (c.telemetry) {
        engine.telemetry.sink = c.telemetry.sink;
        engine.telemetry.target = c.telemetry.target;
    }
    const fallback = c.transport ?? {
        name: "in-process",
        // Without a queue transport the process consumes its own subscriptions inline (Node single-process profile).
        send: (d) => Effect.tryPromise({ try: () => engine.consume(d.subscription, d.envelope).then(() => undefined), catch: (e) => new Error(String(e)) }),
    };
    const dispatcher = new Dispatcher(model, c.store, withProjections(engine, fallback), { subscriptions: internalSubscriptions(engine, c.subscriptions ?? defaultSubscriptions(model)), leaseMs: c.leaseMs ?? 30_000, maxAttempts: c.maxAttempts ?? 8 });
    const sweep = async (tenant, now = Date.now()) => {
        await Effect.runPromise(dispatcher.sweep(tenant, { now }));
        await Effect.runPromise(engine.workflows.sweep(tenant));
        await Effect.runPromise(engine.schedules.tick(tenant, new Date(now).toISOString()));
    };
    const sweepAll = async (now = Date.now()) => {
        // Outbox tenants plus tenants with workflow instances (a sleeping instance has no outbox row).
        const tenants = new Set([...(await Effect.runPromise(c.store.outboxTenants())), ...(await Effect.runPromise(engine.workflows.tenants()))]);
        await Promise.all([...tenants].map((t) => sweep(t, now)));
    };
    return { model, engine, store: c.store, dispatcher, sweep, sweepAll };
}
export function assuranceProfile(deployment, requested) {
    if (requested === "isolated-callable" && (deployment.isolation !== "attested-boundary" || !deployment.attestation)) {
        return { requested, granted: "workload-bound", reason: "a shared process cannot attest which function executed; a compromised workload could impersonate a sibling function" };
    }
    return { requested, granted: requested };
}
/** Every declared subscription, consumed in-process. */
function defaultSubscriptions(model) {
    const out = {};
    for (const s of model.bundle.messaging?.subscriptions ?? [])
        (out[s.channel] ??= []).push(s.name);
    return out;
}
