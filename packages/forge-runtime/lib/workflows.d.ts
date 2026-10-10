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
import { Effect } from "effect";
import { type Wire } from "./decode.js";
import type { Transport } from "./dispatch.js";
import type { CallContext, Engine } from "./engine.js";
import { ForgeError } from "./errors.js";
import type { WorkflowDecl } from "./model.js";
import { type RuntimeServices } from "./services.js";
type Doc = Record<string, unknown> & {
    _version?: number;
};
export type InstanceStatus = "running" | "waiting" | "sleeping" | "completed" | "failed" | "cancelled";
export interface HistoryEntry {
    step: string;
    kind: string;
    at: string;
}
export interface Instance extends Doc {
    id: string;
    workflow: string;
    version: number;
    graphHash: string;
    status: InstanceStatus;
    input: Wire;
    bindings: Record<string, unknown>;
    pc: number;
    consumed: string[];
    history: HistoryEntry[];
    waiting?: {
        step: string;
        channel: string;
        message: string;
        correlationKey: string;
        dueAt?: string;
    };
    sleeping?: {
        step: string;
        dueAt: string;
    };
    output?: unknown;
    error?: {
        code: string;
        detail?: string;
    };
    /** Provider driver state (e.g. a Step Functions task token for the current wait). */
    driver?: Record<string, unknown>;
    createdAt: string;
    updatedAt: string;
}
/**
 * A provider's durable driver (Cloudflare Workflows instance, Step Functions execution).
 * `started` spawns it after the instance exists; `wake` nudges it after a signal or cancel
 * so a native wait ends without waiting for its deadline.
 */
export interface WorkflowDriver {
    started(tenant: string, wf: WorkflowDecl, instanceId: string): Promise<void>;
    wake(tenant: string, wf: WorkflowDecl, inst: Instance): Promise<void>;
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
export declare function stepIdempotencyKey(inst: {
    id: string;
    history: readonly {
        step: string;
    }[];
}, stepId: string): string;
export declare class Workflows {
    private readonly engine;
    private readonly programs;
    /** Provider driver; absent for the reference executor (the sweep is the timer). */
    driver: WorkflowDriver | null;
    /** Test-only fault injection: crash after this step's activity succeeded, before its receipt. */
    readonly faults: {
        crashAfterStep: string | null;
    };
    constructor(engine: Engine);
    private program;
    private docId;
    private inboxId;
    private waitersId;
    private activeId;
    /** Start: create the instance (idempotent per key) and run until it blocks or ends. */
    start(wf: WorkflowDecl, input: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    get(wf: WorkflowDecl, id: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    cancel(wf: WorkflowDecl, id: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    private cancelRetry;
    /** Deliver one message to every wait step of the workflow that matches its correlation key. */
    signal(wf: WorkflowDecl, message: string, messageId: string, payload: Wire, ctx: CallContext): Effect.Effect<{
        delivered: number;
        held: number;
    }, ForgeError, RuntimeServices>;
    /** Reference timer: advance every active instance (due timers fire, crashed `running` instances resume). */
    sweep(tenant: string): Effect.Effect<{
        advanced: number;
    }, never, never>;
    /** Tenants that have ever started a workflow instance (durable registry for sweep-driven hosts). */
    tenants(): Effect.Effect<string[], never, never>;
    /** Ids of instances that have not reached a terminal status. */
    inflight(tenant: string, wf?: WorkflowDecl): Effect.Effect<string[], never, never>;
    /** In-flight instances across every workflow (what a provider switch must drain, never copy). */
    countInstances(tenant: string): Effect.Effect<number, never, never>;
    /** Run the instance until it blocks (wait/sleep) or ends; every transition is a CAS write. */
    advance(tenant: string, id: string, wf?: WorkflowDecl): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    /** One node transition; returns the updated instance (unsaved) or null when blocked. */
    private step;
    private terminal;
    private finish;
    /** Function calls take the named arguments as input; transitions split `id`/`expectedVersion` from the action input. */
    private lower;
    private errorName;
    private save;
    /** CAS update of a small id list document (waiters, active instances). */
    private listMutate;
    private render;
    /** Wake the provider driver with the raw instance (driver state included); never fails the caller. */
    private wakeDriver;
    /** Provider drivers park a callback handle on the instance (CAS) while it waits. */
    setDriverState(tenant: string, id: string, state: Record<string, unknown>): Effect.Effect<void, ForgeError, RuntimeServices>;
    /** Raw instance (with driver state) for provider drivers. */
    load(tenant: string, id: string): Effect.Effect<Instance, ForgeError, RuntimeServices>;
    /** Wait steps subscribe to their channel: `workflow:<Name>:<step>` logical subscriptions. */
    subscriptions(base?: Record<string, string[]>): Record<string, string[]>;
    /** In-process transport delivering channel messages to workflow inboxes. */
    transport(): Transport;
}
export {};
