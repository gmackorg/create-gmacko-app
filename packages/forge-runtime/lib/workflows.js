/**
 * Workflows (plan §15): the portable executor for WorkflowIR.
 *
 * The step graph is compiled to a small control-flow program whose node
 * indices are stable for a pinned (version, graphHash). An instance is one
 * document advanced with optimistic versioning, so every transition — an
 * activity receipt, a consumed signal, a timeout, a terminal — is a CAS write
 * and two racing drivers can never both record an outcome. Activities are
 * invoked with the idempotency key `wf:<instance>:<version>:<step>`, so a
 * retry after a crash between the activity and its receipt replays the
 * stored result instead of re-running the effect.
 *
 * Signals go through a durable inbox keyed by (workflow, wait step, message,
 * correlation key) and are deduplicated by messageId; a signal that arrives
 * before its waiter registers is consumed when the wait step is reached.
 * Provider drivers (Cloudflare Workflows, Step Functions) call `advance` and
 * use native timers; the `sweep` here is the reference/fallback timer.
 */
import { Cause, Effect } from "effect";
import { decodeValue } from "./decode.js";
import { err, ForgeError } from "./errors.js";
import { durationMs } from "./readmodels.js";
import { Clock, IdGen, Storage } from "./services.js";
const KIND = "workflow";
/** System tenant holding the registry of tenants with workflow instances (no business data). */
const REGISTRY_TENANT = "_forge";
function compile(steps) {
    const nodes = [];
    const emit = (list, next) => {
        // Build back to front so every node knows its successor.
        let entry = next;
        for (let i = list.length - 1; i >= 0; i--) {
            const s = list[i];
            const idx = nodes.length;
            if (s.kind === "choice") {
                const node = { step: s, next: entry };
                nodes.push(node);
                node.then = emit(s.then, entry);
                node.otherwise = emit(s.otherwise, entry);
                entry = idx;
            }
            else if (s.kind === "parallel") {
                // Reference lowering runs branches in declared order; providers may run them concurrently.
                let e = entry;
                for (let b = s.branches.length - 1; b >= 0; b--)
                    e = emit(s.branches[b], e);
                // The parallel node itself is a no-op jump into the first branch.
                const pidx = nodes.length;
                nodes.push({ step: s, next: e });
                entry = pidx;
            }
            else {
                nodes.push({ step: s, next: entry });
                entry = idx;
            }
        }
        return entry;
    };
    const entry = emit(steps, -1);
    // Reorder so that entry is 0: remap indices deterministically.
    const order = [];
    const seen = new Set();
    const visit = (i) => {
        if (i < 0 || seen.has(i))
            return;
        seen.add(i);
        order.push(i);
        const n = nodes[i];
        if (n.then !== undefined)
            visit(n.then);
        if (n.otherwise !== undefined)
            visit(n.otherwise);
        visit(n.next);
    };
    visit(entry);
    const remap = new Map(order.map((old, i) => [old, i]));
    const map = (i) => (i === undefined || i < 0 ? i : remap.get(i));
    return order.map((old) => {
        const n = nodes[old];
        const out = { step: n.step, next: map(n.next) };
        if (n.then !== undefined)
            out.then = map(n.then);
        if (n.otherwise !== undefined)
            out.otherwise = map(n.otherwise);
        return out;
    });
}
/** Workflow expressions bind `input` and completed step results. */
function evalWf(e, env) {
    switch (e.kind) {
        case "literal": {
            const l = e.literal;
            if (l.type === "bool")
                return l.value;
            if (l.type === "null")
                return null;
            if (l.type === "int")
                return Number(l.value);
            return l.value;
        }
        case "name": {
            let cur = env;
            for (const seg of e.path)
                cur = cur && typeof cur === "object" ? cur[seg] : undefined;
            return cur ?? null;
        }
        case "unary": {
            const v = evalWf(e.operand, env);
            return e.op === "!" ? !v : typeof v === "number" ? -v : v;
        }
        case "binary": {
            const l = evalWf(e.lhs, env);
            const r = evalWf(e.rhs, env);
            switch (e.op) {
                case "&&": return Boolean(l) && Boolean(r);
                case "||": return Boolean(l) || Boolean(r);
                case "==": return cmp(l, r) === 0;
                case "!=": return cmp(l, r) !== 0;
                case "<": return cmp(l, r) < 0;
                case "<=": return cmp(l, r) <= 0;
                case ">": return cmp(l, r) > 0;
                case ">=": return cmp(l, r) >= 0;
                default: return null;
            }
        }
        default:
            return null;
    }
}
/** Numeric strings (decimal/money) compare exactly as scaled integers; everything else compares canonically. */
function cmp(a, b) {
    const num = /^-?\d+(\.\d+)?$/;
    if ((typeof a === "number" || (typeof a === "string" && num.test(a))) && (typeof b === "number" || (typeof b === "string" && num.test(b)))) {
        const [x, y] = [String(a), String(b)];
        const scale = Math.max(x.split(".")[1]?.length ?? 0, y.split(".")[1]?.length ?? 0);
        const toInt = (s) => { const [i, f = ""] = s.split("."); return BigInt(i + f.padEnd(scale, "0")); };
        const d = toInt(x) - toInt(y);
        return d < 0n ? -1 : d > 0n ? 1 : 0;
    }
    const [x, y] = [String(a ?? ""), String(b ?? "")];
    return x < y ? -1 : x > y ? 1 : 0;
}
/**
 * The idempotency key for one execution of one workflow step.
 *
 * It identifies *which execution of which step of which instance* this is, and nothing else. In
 * particular it must not depend on the instance version: the version moves whenever anything
 * else touches the instance — a delivered signal, a competing driver — and those are precisely
 * the events that make a step's save conflict and force it to be retried. A version-derived key
 * changes on exactly the retry that needs to be recognised as a replay, so the activity commits
 * twice: the second attempt then fails with VersionConflict against the record the first attempt
 * already moved, and the workflow reports that instead of its real outcome.
 *
 * Counting how often the step already appears in history gives a key that is stable across
 * retries (an unsaved attempt adds nothing to history) and distinct per pass when a loop brings
 * the program back to the same step.
 */
export function stepIdempotencyKey(inst, stepId) {
    const pass = inst.history.filter((h) => h.step === stepId).length;
    return `wf:${inst.id}:${stepId}:${pass}`;
}
export class Workflows {
    engine;
    programs = new Map();
    /** Provider driver; absent for the reference executor (the sweep is the timer). */
    driver = null;
    /** Test-only fault injection: crash after this step's activity succeeded, before its receipt. */
    faults = { crashAfterStep: null };
    constructor(engine) {
        this.engine = engine;
    }
    program(wf) {
        let p = this.programs.get(wf.id);
        if (!p) {
            p = compile(wf.steps);
            this.programs.set(wf.id, p);
        }
        return p;
    }
    docId(wf, id) { return `${wf.name}:${id}`; }
    inboxId(wf, step, message, key) { return `${wf.name}:inbox:${step}:${message}:${key}`; }
    waitersId(wf, step, message, key) { return `${wf.name}:waiters:${step}:${message}:${key}`; }
    activeId(wf) { return `${wf.name}:active`; }
    // ------------------------------------------------------------ public ops
    /** Start: create the instance (idempotent per key) and run until it blocks or ends. */
    start(wf, input, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            const now = (yield* Clock).now();
            if (wf.input && self.engine.model.bundle.ir.requires?.includes("workflow-map/1")) {
                input = yield* Effect.try({ try: () => decodeValue(self.engine.model, wf.input, input), catch: () => err("ValidationFailed", "workflow input does not match its declared type") });
            }
            const keyDoc = ctx.idempotencyKey ? `${wf.name}:start:${ctx.idempotencyKey}` : null;
            if (keyDoc) {
                const existing = (yield* storage.getDocument(ctx.tenant, KIND, keyDoc));
                if (existing)
                    return yield* self.get(wf, existing.instance, ctx);
            }
            const id = (yield* IdGen).next({ name: `wf${wf.name}` });
            const inst = { id, workflow: wf.id, version: wf.version, graphHash: wf.graphHash, status: "running", input, bindings: {}, pc: 0, consumed: [], history: [], createdAt: now, updatedAt: now };
            yield* storage.putDocument(ctx.tenant, KIND, self.docId(wf, id), inst, null);
            if (keyDoc)
                yield* storage.putDocument(ctx.tenant, KIND, keyDoc, { instance: id }, null).pipe(Effect.catch(() => Effect.void));
            yield* self.listMutate(ctx.tenant, self.activeId(wf), (ids) => [...ids, id]);
            // Hosts without a native driver sweep in-flight instances; they need to know which tenants have any.
            yield* self.listMutate(REGISTRY_TENANT, "tenants", (ids) => (ids.includes(ctx.tenant) ? ids : [...ids, ctx.tenant]));
            const state = yield* self.advance(ctx.tenant, id, wf);
            if (self.driver && ["running", "waiting", "sleeping"].includes(state["status"])) {
                yield* Effect.tryPromise({ try: () => self.driver.started(ctx.tenant, wf, id), catch: (e) => err("Internal", `workflow driver failed to start: ${String(e)}`) });
            }
            return state;
        });
    }
    get(wf, id, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const inst = (yield* (yield* Storage).getDocument(ctx.tenant, KIND, self.docId(wf, id)));
            if (!inst)
                return yield* Effect.fail(err("NotFound", `workflow instance ${id} not found`));
            return self.render(inst);
        });
    }
    cancel(wf, id, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            const inst = (yield* storage.getDocument(ctx.tenant, KIND, self.docId(wf, id)));
            if (!inst)
                return yield* Effect.fail(err("NotFound", `workflow instance ${id} not found`));
            if (!["running", "waiting", "sleeping"].includes(inst.status))
                return yield* Effect.fail(err("InvalidTransition", `instance is ${inst.status}; completed effects are not undone by cancellation`));
            const now = (yield* Clock).now();
            const next = self.finish(inst, "cancelled", now, { step: inst.waiting?.step ?? inst.sleeping?.step ?? "", kind: "cancel", at: now });
            const saved = yield* self.save(ctx.tenant, wf, inst, next).pipe(Effect.catch((e) => (e.code === "TransientConflict" ? self.cancelRetry(wf, id, ctx) : Effect.fail(e))));
            if (self.driver)
                yield* self.wakeDriver(ctx.tenant, wf, saved.id);
            return self.render(next);
        });
    }
    cancelRetry(wf, id, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            const inst = (yield* storage.getDocument(ctx.tenant, KIND, self.docId(wf, id)));
            if (!inst)
                return yield* Effect.fail(err("NotFound", `workflow instance ${id} not found`));
            if (!["running", "waiting", "sleeping"].includes(inst.status))
                return yield* Effect.fail(err("InvalidTransition", `instance is ${inst.status}; completed effects are not undone by cancellation`));
            const now = (yield* Clock).now();
            return yield* self.save(ctx.tenant, wf, inst, self.finish(inst, "cancelled", now, { step: inst.waiting?.step ?? inst.sleeping?.step ?? "", kind: "cancel", at: now }));
        });
    }
    /** Deliver one message to every wait step of the workflow that matches its correlation key. */
    signal(wf, message, messageId, payload, ctx) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            const now = (yield* Clock).now();
            let delivered = 0;
            let held = 0;
            for (const node of self.program(wf)) {
                const s = node.step;
                if (s.kind !== "wait" || s.message !== message)
                    continue;
                const key = s.correlate ? String(payload[s.correlate.field] ?? "") : "";
                // Persist before acknowledging: the inbox is the durable record, deduplicated by messageId.
                const inboxId = self.inboxId(wf, s.id, message, key);
                const inbox = (yield* storage.getDocument(ctx.tenant, KIND, inboxId));
                if (!inbox?.signals.some((x) => x.messageId === messageId)) {
                    yield* storage.putDocument(ctx.tenant, KIND, inboxId, { signals: [...(inbox?.signals ?? []), { messageId, payload, at: now }] }, inbox?._version ?? null);
                }
                const waiters = (yield* storage.getDocument(ctx.tenant, KIND, self.waitersId(wf, s.id, message, key)));
                let consumedHere = 0;
                for (const id of waiters?.instances ?? []) {
                    const before = (yield* storage.getDocument(ctx.tenant, KIND, self.docId(wf, id)));
                    if (!before || before.status !== "waiting" || before.consumed.includes(messageId))
                        continue;
                    // An incompatible deployment or a concurrent driver leaves the signal held in the inbox.
                    let after = yield* self.advance(ctx.tenant, id, wf).pipe(Effect.catch(() => Effect.succeed(null)));
                    if (!after)
                        after = (yield* storage.getDocument(ctx.tenant, KIND, self.docId(wf, id)));
                    if (after && after["consumed"].includes(messageId)) {
                        consumedHere++;
                        if (self.driver)
                            yield* self.wakeDriver(ctx.tenant, wf, id);
                    }
                }
                delivered += consumedHere;
                if (consumedHere === 0)
                    held++;
            }
            return { delivered, held };
        });
    }
    /** Reference timer: advance every active instance (due timers fire, crashed `running` instances resume). */
    sweep(tenant) {
        const self = this;
        return Effect.gen(function* () {
            let advanced = 0;
            for (const wf of self.engine.model.workflows) {
                const ids = yield* self.inflight(tenant, wf);
                for (const id of ids) {
                    const r = yield* self.advance(tenant, id, wf).pipe(Effect.catch(() => Effect.succeed(null)));
                    if (r)
                        advanced++;
                }
            }
            return { advanced };
        }).pipe(Effect.provide(this.engine.layer));
    }
    /** Tenants that have ever started a workflow instance (durable registry for sweep-driven hosts). */
    tenants() {
        return Effect.gen(function* () {
            const doc = (yield* (yield* Storage).getDocument(REGISTRY_TENANT, KIND, "tenants"));
            return doc?.ids ?? [];
        }).pipe(Effect.catch(() => Effect.succeed([])), Effect.provide(this.engine.layer));
    }
    /** Ids of instances that have not reached a terminal status. */
    inflight(tenant, wf) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            const out = [];
            for (const w of wf ? [wf] : self.engine.model.workflows) {
                const active = (yield* storage.getDocument(tenant, KIND, self.activeId(w)));
                out.push(...(active?.ids ?? []));
            }
            return out;
        }).pipe(Effect.catch(() => Effect.succeed([])), Effect.provide(this.engine.layer));
    }
    /** In-flight instances across every workflow (what a provider switch must drain, never copy). */
    countInstances(tenant) {
        return this.inflight(tenant).pipe(Effect.map((ids) => ids.length));
    }
    // -------------------------------------------------------------- executor
    /** Run the instance until it blocks (wait/sleep) or ends; every transition is a CAS write. */
    advance(tenant, id, wf) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            let inst = null;
            let decl = wf;
            for (const w of wf ? [wf] : self.engine.model.workflows) {
                inst = (yield* storage.getDocument(tenant, KIND, self.docId(w, id)));
                if (inst) {
                    decl = w;
                    break;
                }
            }
            if (!inst || !decl)
                return yield* Effect.fail(err("NotFound", `workflow instance ${id} not found`));
            if (inst.version !== decl.version || inst.graphHash !== decl.graphHash) {
                return yield* Effect.fail(err("WorkflowVersionMismatch", `instance is pinned to ${decl.name} v${inst.version} (${inst.graphHash.slice(0, 8)}); deployed is v${decl.version} (${decl.graphHash.slice(0, 8)})`));
            }
            const program = self.program(decl);
            const docId = self.docId(decl, id);
            // Several drivers may advance one instance (an HTTP request, the provider's durable driver, the
            // sweep). Transitions are deterministic from persisted state and activities are exactly-once at
            // the storage level, so a driver that loses a CAS reloads and continues from the winner's state.
            let conflicts = 0;
            for (let guard = 0; guard < 10_000; guard++) {
                if (!["running", "waiting", "sleeping"].includes(inst.status))
                    break;
                const now = (yield* Clock).now();
                const node = program[inst.pc];
                const attempt = Effect.gen(function* () {
                    if (!node) { // fell off the end without a terminal: complete with no output
                        return yield* self.save(tenant, decl, inst, self.finish(inst, "completed", now, { step: "", kind: "end", at: now }));
                    }
                    const next = yield* self.step(tenant, decl, inst, node, now);
                    if (next === null)
                        return null; // blocked
                    return yield* self.save(tenant, decl, inst, next);
                });
                const exit = yield* Effect.exit(attempt);
                if (exit._tag === "Failure") {
                    const e = Cause.squash(exit.cause);
                    if (e instanceof ForgeError && e.code === "TransientConflict" && ++conflicts < 50) {
                        const fresh = (yield* storage.getDocument(tenant, KIND, docId));
                        if (!fresh)
                            return yield* Effect.fail(err("NotFound", `workflow instance ${id} vanished`));
                        inst = fresh;
                        continue;
                    }
                    return yield* Effect.fail(e instanceof ForgeError ? e : err("Internal", String(e)));
                }
                if (exit.value === null)
                    break;
                inst = exit.value;
            }
            return self.render(inst);
        });
    }
    /** One node transition; returns the updated instance (unsaved) or null when blocked. */
    step(tenant, wf, inst, node, now) {
        const self = this;
        const s = node.step;
        const env = { input: inst.input, ...inst.bindings };
        return Effect.gen(function* () {
            switch (s.kind) {
                case "call": {
                    const { opId, input } = self.lower(s, env);
                    const callCtx = { tenant, actor: "workflow", requestId: `${inst.id}:${s.id}`, idempotencyKey: stepIdempotencyKey(inst, s.id) };
                    const exit = yield* Effect.exit(self.engine.callInternal(opId, input, callCtx));
                    if (exit._tag === "Failure") {
                        const fe = Cause.squash(exit.cause);
                        if (!(fe instanceof ForgeError))
                            return yield* Effect.fail(err("Internal", "workflow activity died"));
                        if (fe.code === "TransientConflict")
                            return yield* Effect.fail(fe); // another driver ran this activity: reload and continue
                        const name = self.errorName(s, fe.code);
                        const caught = s.catches.find((c) => c.error === name);
                        const entry = { step: s.id, kind: "error", at: now };
                        if (caught)
                            return self.terminal(inst, caught.then, wf, now, entry);
                        return self.finish(inst, "failed", now, entry, { code: fe.code, ...(fe.detail ? { detail: fe.detail } : {}) });
                    }
                    if (self.faults.crashAfterStep === s.id)
                        return yield* Effect.fail(err("Internal", `injected crash after ${s.id}`));
                    return { ...inst, status: "running", bindings: { ...inst.bindings, [s.id]: exit.value }, pc: node.next, history: [...inst.history, { step: s.id, kind: "call", at: now }] };
                }
                case "map": {
                    const items = evalWf(s.source, env);
                    if (!Array.isArray(items) || items.length > s.max_items || s.max_items > 1024 || !Number.isInteger(s.concurrency) || s.concurrency < 1 || s.concurrency > 32) {
                        return self.finish(inst, "failed", now, { step: s.id, kind: "error", at: now }, { code: "InvalidMapInput" });
                    }
                    const storage = yield* Storage;
                    // Fixed waves bound the set of runnable positions even when drivers race.
                    // Each child receipt is durable independently of the parent checkpoint.
                    const results = [];
                    for (let offset = 0; offset < items.length; offset += s.concurrency) {
                        const current = yield* storage.getDocument(tenant, KIND, self.docId(wf, inst.id));
                        if (current?.["status"] !== "running" || current["pc"] !== inst.pc)
                            return null;
                        const wave = items.slice(offset, offset + s.concurrency);
                        const outcomes = yield* Effect.forEach(wave, (item, local) => Effect.gen(function* () {
                            const index = offset + local;
                            const childId = `${self.docId(wf, inst.id)}:map:${s.id}:${index}`;
                            const existing = yield* storage.getDocument(tenant, "workflow-map", childId);
                            if (existing?.["state"] === "done")
                                return existing;
                            const startedAt = (yield* Clock).now();
                            if (existing?.["state"] === "running" && String(existing["leaseUntil"]) > startedAt)
                                return { blocked: true };
                            const expected = existing?.["_version"] ?? null;
                            const reserved = yield* storage.putDocument(tenant, "workflow-map", childId, {
                                state: "running", leaseUntil: new Date(Date.parse(startedAt) + 300_000).toISOString(),
                            }, expected).pipe(Effect.exit);
                            if (reserved._tag === "Failure") {
                                const error = Cause.squash(reserved.cause);
                                if (error instanceof ForgeError && error.code === "VersionConflict")
                                    return { blocked: true };
                                return yield* Effect.fail(error instanceof ForgeError ? error : err("Internal", "map reservation failed"));
                            }
                            const { opId, input } = self.lower(s.call, { ...env, [s.binding]: item });
                            const exit = yield* Effect.exit(self.engine.callInternal(opId, input, {
                                tenant, actor: "workflow", requestId: childId,
                                idempotencyKey: stepIdempotencyKey(inst, `${s.id}:${index}`),
                            }));
                            let outcome;
                            if (exit._tag === "Failure") {
                                const error = Cause.squash(exit.cause);
                                if (!(error instanceof ForgeError))
                                    return yield* Effect.fail(err("Internal", "mapped activity died"));
                                if (error.code === "TransientConflict")
                                    return yield* Effect.fail(error);
                                outcome = { state: "done", error: { code: error.code } };
                            }
                            else
                                outcome = { state: "done", value: exit.value };
                            if (new TextEncoder().encode(JSON.stringify(outcome)).length > 256 * 1024)
                                outcome = { state: "done", error: { code: "MapResultTooLarge" } };
                            // Losing drivers read the committed outcome rather than overwriting it.
                            yield* storage.putDocument(tenant, "workflow-map", childId, outcome, (expected ?? 0) + 1).pipe(Effect.catch(e => e.code === "VersionConflict" ? Effect.void : Effect.fail(e)));
                            const saved = yield* storage.getDocument(tenant, "workflow-map", childId);
                            return saved;
                        }), { concurrency: s.concurrency });
                        if (outcomes.some(o => o["blocked"] || o["state"] !== "done"))
                            return null;
                        const failed = outcomes.find(o => o["error"]);
                        if (failed)
                            return self.finish(inst, "failed", now, { step: s.id, kind: "error", at: now }, failed["error"]);
                        results.push(...outcomes.map(o => o["value"]));
                        if (self.faults.crashAfterStep === s.id)
                            return yield* Effect.fail(err("Internal", `injected crash after ${s.id}`));
                    }
                    if (new TextEncoder().encode(JSON.stringify(results)).length > 256 * 1024) {
                        return self.finish(inst, "failed", now, { step: s.id, kind: "error", at: now }, { code: "MapResultTooLarge" });
                    }
                    return { ...inst, status: "running", bindings: { ...inst.bindings, [s.id]: results }, pc: node.next, history: [...inst.history, { step: s.id, kind: "map", at: now }] };
                }
                case "sleep": {
                    if (inst.status !== "sleeping" || inst.sleeping?.step !== s.id) {
                        const dueAt = new Date(Date.parse(now) + durationMs(s.duration)).toISOString();
                        return { ...inst, status: "sleeping", sleeping: { step: s.id, dueAt } };
                    }
                    if (inst.sleeping.dueAt > now)
                        return null;
                    const { sleeping, ...rest } = inst;
                    void sleeping;
                    return { ...rest, status: "running", pc: node.next, history: [...inst.history, { step: s.id, kind: "sleep", at: now }] };
                }
                case "wait": {
                    const key = s.correlate ? String(evalWf(s.correlate.value, env) ?? "") : "";
                    if (inst.status !== "waiting" || inst.waiting?.step !== s.id) {
                        // Register the waiter first, then look at the inbox: a signal can never slip between.
                        yield* self.listMutate(tenant, self.waitersId(wf, s.id, s.message, key), (ids) => (ids.includes(inst.id) ? ids : [...ids, inst.id]));
                        const waiting = { step: s.id, channel: s.channel, message: s.message, correlationKey: key, ...(s.timeout ? { dueAt: new Date(Date.parse(now) + durationMs(s.timeout.duration)).toISOString() } : {}) };
                        return { ...inst, status: "waiting", waiting };
                    }
                    const inbox = (yield* (yield* Storage).getDocument(tenant, KIND, self.inboxId(wf, s.id, s.message, key)));
                    const sig = inbox?.signals.find((x) => !inst.consumed.includes(x.messageId));
                    if (sig) {
                        yield* self.listMutate(tenant, self.waitersId(wf, s.id, s.message, key), (ids) => ids.filter((x) => x !== inst.id));
                        const { waiting, ...rest } = inst;
                        void waiting;
                        return { ...rest, status: "running", pc: node.next, consumed: [...inst.consumed, sig.messageId], bindings: { ...inst.bindings, [s.id]: sig.payload }, history: [...inst.history, { step: s.id, kind: "signal", at: now }] };
                    }
                    if (inst.waiting.dueAt && inst.waiting.dueAt <= now && s.timeout) {
                        yield* self.listMutate(tenant, self.waitersId(wf, s.id, s.message, key), (ids) => ids.filter((x) => x !== inst.id));
                        return self.terminal(inst, s.timeout.then, wf, now, { step: s.id, kind: "timeout", at: now });
                    }
                    return null;
                }
                case "choice": {
                    const take = Boolean(evalWf(s.condition, env));
                    return { ...inst, pc: (take ? node.then : node.otherwise), history: [...inst.history, { step: s.id, kind: "choice", at: now }] };
                }
                case "parallel":
                    return { ...inst, pc: node.next };
                case "return":
                    return self.finish({ ...inst, output: evalWf(s.value, env) }, "completed", now, { step: "return", kind: "return", at: now });
                case "fail":
                    return self.finish(inst, "failed", now, { step: "fail", kind: "fail", at: now }, { code: `${wf.id}.${s.error}` });
            }
        });
    }
    terminal(inst, t, wf, now, entry) {
        const env = { input: inst.input, ...inst.bindings };
        if (t.kind === "return")
            return this.finish({ ...inst, output: evalWf(t.value, env) }, "completed", now, entry);
        return this.finish(inst, "failed", now, entry, { code: `${wf.id}.${t.error}` });
    }
    finish(inst, status, now, entry, error) {
        const { waiting, sleeping, ...rest } = inst;
        void waiting;
        void sleeping;
        return { ...rest, status, history: [...inst.history, entry], ...(error ? { error } : {}), updatedAt: now };
    }
    /** Function calls take the named arguments as input; transitions split `id`/`expectedVersion` from the action input. */
    lower(s, env) {
        const args = {};
        for (const a of s.args)
            args[a.name] = evalWf(a.value, env);
        if (s.target.kind === "function")
            return { opId: s.target.function, input: args };
        const { id, expectedVersion, ...input } = args;
        return { opId: `${s.target.resource}.status.${s.target.action}`, input: { id, expectedVersion, input } };
    }
    errorName(s, code) {
        if (s.target.kind === "function" && code.startsWith(`${s.target.function}.`))
            return code.slice(s.target.function.length + 1);
        return code;
    }
    save(tenant, wf, before, after) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            const { _version, ...doc } = { ...after, updatedAt: (yield* Clock).now() };
            yield* storage.putDocument(tenant, KIND, self.docId(wf, before.id), doc, before._version ?? null).pipe(Effect.mapError((e) => (e.code === "VersionConflict" ? err("TransientConflict", "another driver advanced this workflow instance") : e)));
            if (!["running", "waiting", "sleeping"].includes(after.status)) {
                yield* self.listMutate(tenant, self.activeId(wf), (ids) => ids.filter((x) => x !== before.id));
            }
            return { ...doc, _version: (_version ?? 0) + 1 };
        });
    }
    /** CAS update of a small id list document (waiters, active instances). */
    listMutate(tenant, docId, f) {
        return Effect.gen(function* () {
            const storage = yield* Storage;
            for (let attempt = 0; attempt < 5; attempt++) {
                const cur = (yield* storage.getDocument(tenant, KIND, docId));
                const ids = cur?.ids ?? cur?.instances ?? [];
                const next = f(ids);
                const body = docId.includes(":waiters:") ? { instances: next } : { ids: next };
                const r = yield* storage.putDocument(tenant, KIND, docId, body, cur?._version ?? null).pipe(Effect.exit);
                if (r._tag === "Success")
                    return;
            }
            return yield* Effect.fail(err("TransientConflict", "workflow index contention"));
        });
    }
    render(inst) {
        const { _version, driver, ...rest } = inst;
        void _version;
        void driver;
        return rest;
    }
    /** Wake the provider driver with the raw instance (driver state included); never fails the caller. */
    wakeDriver(tenant, wf, id) {
        const self = this;
        return Effect.gen(function* () {
            const raw = yield* self.load(tenant, id);
            yield* Effect.promise(() => self.driver.wake(tenant, wf, raw).catch(() => undefined));
        }).pipe(Effect.catch(() => Effect.void));
    }
    /** Provider drivers park a callback handle on the instance (CAS) while it waits. */
    setDriverState(tenant, id, state) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            for (const wf of self.engine.model.workflows) {
                for (let attempt = 0; attempt < 5; attempt++) {
                    const inst = (yield* storage.getDocument(tenant, KIND, self.docId(wf, id)));
                    if (!inst)
                        break;
                    const { _version, ...doc } = { ...inst, driver: { ...(inst.driver ?? {}), ...state } };
                    const r = yield* Effect.exit(storage.putDocument(tenant, KIND, self.docId(wf, id), doc, _version ?? null));
                    if (r._tag === "Success")
                        return;
                }
            }
            return yield* Effect.fail(err("NotFound", `workflow instance ${id} not found`));
        });
    }
    /** Raw instance (with driver state) for provider drivers. */
    load(tenant, id) {
        const self = this;
        return Effect.gen(function* () {
            const storage = yield* Storage;
            for (const wf of self.engine.model.workflows) {
                const inst = (yield* storage.getDocument(tenant, KIND, self.docId(wf, id)));
                if (inst)
                    return inst;
            }
            return yield* Effect.fail(err("NotFound", `workflow instance ${id} not found`));
        });
    }
    // ---------------------------------------------------------- integration
    /** Wait steps subscribe to their channel: `workflow:<Name>:<step>` logical subscriptions. */
    subscriptions(base = {}) {
        const out = Object.fromEntries(Object.entries(base).map(([k, v]) => [k, [...v]]));
        for (const wf of this.engine.model.workflows) {
            for (const node of this.program(wf)) {
                if (node.step.kind === "wait")
                    (out[node.step.channel] ??= []).push(`workflow:${wf.name}:${node.step.id}`);
            }
        }
        return out;
    }
    /** In-process transport delivering channel messages to workflow inboxes. */
    transport() {
        const self = this;
        return {
            name: "workflows",
            send: (d) => {
                const m = /^workflow:([^:]+):(.+)$/.exec(d.subscription);
                const wf = m && self.engine.model.workflows.find((w) => w.name === m[1]);
                if (!wf)
                    return Effect.fail(new Error(`unknown workflow subscription ${d.subscription}`));
                const env = d.envelope;
                return self.signal(wf, env.message, env.messageId, env.payload, { tenant: env.tenant, actor: "channel", requestId: env.messageId }).pipe(Effect.provide(self.engine.layer), Effect.asVoid, Effect.mapError((e) => new Error(e.message)));
            },
        };
    }
}
