/** Keyed state transitions with durable receipts. Handlers are synchronous, pure
 * reducers: external effects are returned as data and committed with the state. */
import { executionDigest } from "@forgegraph/capability-manifest";
import { Cause, Effect } from "effect";
import { decodeValue } from "./decode.js";
import { err } from "./errors.js";
function canonical(value) {
    if (Array.isArray(value))
        return `[${value.map(canonical).join(",")}]`;
    if (value && typeof value === "object")
        return `{${Object.entries(value).sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([k, v]) => `${JSON.stringify(k)}:${canonical(v)}`).join(",")}}`;
    return JSON.stringify(value);
}
export class ActorHost {
    model;
    storage;
    definition;
    reducers;
    now;
    constructor(model, storage, definition, reducers, now = Date.now) {
        this.model = model;
        this.storage = storage;
        this.definition = definition;
        this.reducers = reducers;
        this.now = now;
    }
    key(key) { if (!key || key.length > 256)
        throw err("ValidationFailed", "invalid actor key"); return JSON.stringify([this.definition.id, key]); }
    change(tenant, key, reduce) {
        const self = this;
        return Effect.gen(function* () {
            const id = yield* Effect.try({ try: () => self.key(key), catch: e => e });
            for (let retry = 0; retry < 64; retry++) {
                const old = yield* self.storage.getDocument(tenant, "actor", id);
                if (old && old["definitionDigest"] !== executionDigest({ definition: self.definition, ir: self.model.bundle.ir }))
                    return yield* Effect.fail(err("WorkflowVersionMismatch", "actor definition changed; migrate before activation"));
                const next = yield* Effect.try({ try: () => reduce(old ? structuredClone(old) : null), catch: e => e instanceof Error && "code" in e ? e : err("ValidationFailed", "invalid actor transition") });
                if (new TextEncoder().encode(JSON.stringify(next.doc)).length > 256 * 1024)
                    return yield* Effect.fail(err("BudgetExceeded", "actor state/evidence exceeds 256 KiB"));
                const saved = yield* self.storage.putDocument(tenant, "actor", id, next.doc, old?.["_version"] ?? null).pipe(Effect.exit);
                if (saved._tag === "Success")
                    return structuredClone(next.result);
                const error = Cause.squash(saved.cause);
                if (!(error instanceof Error) || !("code" in error) || error.code !== "VersionConflict")
                    return yield* Effect.fail(error);
            }
            return yield* Effect.fail(err("TransientConflict", "actor contention"));
        });
    }
    initialize(tenant, key, state) {
        return this.change(tenant, key, doc => {
            if (doc)
                return { doc, result: doc };
            const initial = { definitionDigest: executionDigest({ definition: this.definition, ir: this.model.bundle.ir }), state: decodeValue(this.model, this.definition.state, state), generation: 1, revision: 0, receipts: [], effects: [], alarms: [] };
            return { doc: initial, result: initial };
        });
    }
    takeover(tenant, key, expectedGeneration) {
        return this.change(tenant, key, doc => {
            if (!doc)
                throw err("NotFound", "actor not initialized");
            if (doc.generation !== expectedGeneration)
                throw err("VersionConflict", "stale actor generation");
            doc.generation++;
            return { doc, result: doc.generation };
        });
    }
    command(tenant, key, messageId, command, payload, generation, alarmOccurrence) {
        return this.change(tenant, key, doc => {
            if (!doc)
                throw err("NotFound", "actor not initialized");
            if (doc.generation !== generation)
                throw err("VersionConflict", "stale actor generation");
            if (!messageId || messageId.length > 256)
                throw err("ValidationFailed", "invalid actor message id");
            const type = this.definition.messages[command], reducer = this.reducers[command];
            if (!type || !reducer)
                throw err("MethodNotAllowed", "unknown actor command");
            const message = decodeValue(this.model, type, payload);
            const encoded = canonical(message);
            const receipt = doc.receipts.find(r => r.id === messageId);
            if (receipt) {
                if (receipt.command !== command || receipt.payload !== encoded)
                    throw err("IdempotencyMismatch", "actor message id reused with different content");
                return { doc, result: { revision: receipt.revision, duplicate: true } };
            }
            if (doc.receipts.length >= 128)
                throw err("BudgetExceeded", "actor receipt capacity reached; lifecycle archival required");
            if (alarmOccurrence) {
                const alarm = doc.alarms.find(a => a.occurrence === alarmOccurrence);
                if (!alarm || alarm.at > this.now() || alarm.command !== command || canonical(alarm.payload) !== canonical(payload))
                    throw err("VersionConflict", "alarm was replaced, cancelled or is not due");
                doc.alarms = doc.alarms.filter(a => a.occurrence !== alarmOccurrence);
            }
            const transition = reducer(structuredClone(doc.state), structuredClone(message));
            doc.state = decodeValue(this.model, this.definition.state, transition.state);
            doc.revision++;
            const effects = transition.effects ?? [];
            if (effects.length > 32 || doc.effects.length + effects.length > 128)
                throw err("BudgetExceeded", "actor effect capacity reached");
            for (const [index, effect] of effects.entries())
                doc.effects.push({ ...structuredClone(effect), id: JSON.stringify([messageId, index]) });
            if (transition.alarms) {
                if (transition.alarms.length > 32 || new Set(transition.alarms.map(a => a.name)).size !== transition.alarms.length)
                    throw err("BudgetExceeded", "invalid actor alarms");
                doc.alarms = transition.alarms.map(alarm => {
                    const type = this.definition.messages[alarm.command];
                    if (!type || !alarm.name || !Number.isSafeInteger(alarm.at) || alarm.at < this.now())
                        throw err("ValidationFailed", "invalid actor alarm");
                    return { ...alarm, payload: decodeValue(this.model, type, alarm.payload), occurrence: JSON.stringify([doc.revision, alarm.name]) };
                });
            }
            doc.receipts.push({ id: messageId, command, payload: encoded, revision: doc.revision });
            return { doc, result: { revision: doc.revision, duplicate: false } };
        });
    }
    load(tenant, key) { return Effect.suspend(() => this.storage.getDocument(tenant, "actor", this.key(key)).pipe(Effect.flatMap(doc => doc ? Effect.succeed(structuredClone(doc)) : Effect.fail(err("NotFound", "actor not initialized"))))); }
    fireDue(tenant, key, generation) {
        const self = this;
        return Effect.gen(function* () {
            const doc = yield* self.load(tenant, key);
            let fired = 0;
            // Bound each pass to the initial batch; replacement occurrences run on a later pass.
            for (const alarm of doc.alarms.filter(a => a.at <= self.now())) {
                const result = yield* self.command(tenant, key, `alarm:${alarm.occurrence}`, alarm.command, alarm.payload, generation, alarm.occurrence).pipe(Effect.catch(error => {
                    if (error.code !== "VersionConflict")
                        return Effect.fail(error);
                    return self.load(tenant, key).pipe(Effect.flatMap(current => {
                        // Cancellation/replacement is normal. Never hide fencing or a still-live conflict.
                        if (current.generation !== generation || current.alarms.some(a => a.occurrence === alarm.occurrence))
                            return Effect.fail(error);
                        return Effect.succeed(null);
                    }));
                }));
                if (result && !result.duplicate)
                    fired++;
            }
            return fired;
        });
    }
    acknowledgeEffect(tenant, key, id, generation) {
        return this.change(tenant, key, doc => {
            if (!doc)
                throw err("NotFound", "actor not initialized");
            if (doc.generation !== generation)
                throw err("VersionConflict", "stale actor generation");
            doc.effects = doc.effects.filter(e => e.id !== id);
            return { doc, result: undefined };
        });
    }
}
export class DurableObjectActorStore {
    storage;
    constructor(storage) {
        this.storage = storage;
    }
    getDocument(tenant, kind, id) { return Effect.tryPromise({ try: async () => await this.storage.get(JSON.stringify([tenant, kind, id])) ?? null, catch: () => err("StorageUnavailable", "actor storage unavailable") }); }
    putDocument(tenant, kind, id, doc, expectedVersion) {
        const key = JSON.stringify([tenant, kind, id]);
        return Effect.tryPromise({ try: () => this.storage.transaction(async (tx) => { const previous = await tx.get(key); if ((previous?.["_version"] ?? null) !== expectedVersion)
                throw err("VersionConflict", "actor changed concurrently"); await tx.put(key, { ...doc, _version: (expectedVersion ?? 0) + 1 }); const alarms = doc["alarms"]; const due = Math.min(...(alarms ?? []).map(a => a.at)); if (Number.isFinite(due))
                await tx.setAlarm(due);
            else
                await tx.deleteAlarm(); }), catch: e => e instanceof Error && "code" in e ? e : err("StorageUnavailable", "actor storage unavailable") });
    }
}
/** Bind this wrapper to one Durable Object identity. The host authenticates the
 * tenant/key and commands before calling it; alarm() is the DO alarm entrypoint. */
export class DurableActorSession {
    storage;
    tenant;
    key;
    host;
    constructor(model, storage, definition, reducers, tenant, key) {
        this.storage = storage;
        this.tenant = tenant;
        this.key = key;
        this.host = new ActorHost(model, new DurableObjectActorStore(storage), definition, reducers);
    }
    async initialize(state) { return Effect.runPromise(this.host.initialize(this.tenant, this.key, state)); }
    async command(messageId, command, payload, generation) { return Effect.runPromise(this.host.command(this.tenant, this.key, messageId, command, payload, generation)); }
    async alarm() { const state = await Effect.runPromise(this.host.load(this.tenant, this.key)); return Effect.runPromise(this.host.fireDue(this.tenant, this.key, state.generation)); }
}
