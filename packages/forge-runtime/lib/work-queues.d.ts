/** Bounded portable work queues. One CAS document seals task and runner state;
 * wakeups are advisory. Callers authenticate/authorize before invoking this service. */
import { deriveWorkflowStepRequirements, deriveExecutionRequirements, type ExecutionRequirements } from "@forgegraph/capability-manifest";
import { Effect } from "effect";
import { type ForgeError } from "./errors.js";
import type { StorageAdapter } from "./services.js";
export interface QueueDefinition {
    id: string;
    execute: string;
    leaseMs: number;
    maxAttempts: number;
    maxTasks: number;
    maxRunners: number;
}
export type TaskRequirements = ExecutionRequirements;
export interface QueueTask {
    id: string;
    input: Record<string, unknown>;
    requirements: TaskRequirements;
    priority: number;
    createdAt: number;
    status: "queued" | "claimed" | "running" | "completed" | "failed" | "cancelled";
    generation: number;
    attempts: number;
    runner?: string;
    leaseUntil?: number;
    result?: Record<string, unknown>;
    history: {
        kind: string;
        at: number;
        generation: number;
        runner?: string;
    }[];
}
export interface QueueRunner {
    id: string;
    capabilities: string[];
    presence: "online" | "draining" | "offline";
    lastSeen: number;
}
export interface QueueWakeup {
    notify(tenant: string, queue: string): Promise<void>;
}
export interface QueueEvent {
    queue: string;
    kind: string;
    depth: number;
    task?: string;
    generation?: number;
}
export declare class InProcessQueueWakeup implements QueueWakeup {
    private readonly wake;
    constructor(wake: (tenant: string, queue: string) => void);
    notify(tenant: string, queue: string): Promise<void>;
}
export declare class CloudflareQueueWakeup implements QueueWakeup {
    private readonly queue;
    constructor(queue: {
        send(body: unknown): Promise<void>;
    });
    notify(tenant: string, queue: string): Promise<void>;
}
export declare class WorkQueue {
    private readonly storage;
    readonly definition: QueueDefinition;
    private readonly now;
    private readonly wakeup?;
    private readonly observe?;
    constructor(storage: StorageAdapter, definition: QueueDefinition, now?: () => number, wakeup?: QueueWakeup | undefined, observe?: ((event: QueueEvent) => void) | undefined);
    private mutate;
    private task;
    private evidence;
    private fenced;
    register(tenant: string, runner: QueueRunner): Effect.Effect<QueueRunner, ForgeError>;
    enqueueDerived(tenant: string, id: string, input: Record<string, unknown>, provenance: Parameters<typeof deriveExecutionRequirements>[0], priority?: number): Effect.Effect<QueueTask, ForgeError>;
    /** Enqueue the selected pinned workflow activity; branch decisions and map item IDs belong to the caller. */
    enqueueWorkflowStep(tenant: string, id: string, input: Record<string, unknown>, provenance: Parameters<typeof deriveWorkflowStepRequirements>[0], priority?: number): Effect.Effect<QueueTask, ForgeError>;
    enqueue(tenant: string, id: string, input: Record<string, unknown>, requirements: TaskRequirements, priority?: number): Effect.Effect<QueueTask, ForgeError>;
    claimNext(tenant: string, runnerId: string): Effect.Effect<QueueTask | null, ForgeError>;
    start(tenant: string, id: string, runner: string, generation: number): Effect.Effect<QueueTask, ForgeError, never>;
    heartbeat(tenant: string, id: string, runner: string, generation: number): Effect.Effect<QueueTask, ForgeError, never>;
    complete(tenant: string, id: string, runner: string, generation: number, result: Record<string, unknown>): Effect.Effect<QueueTask, ForgeError, never>;
    fail(tenant: string, id: string, runner: string, generation: number): Effect.Effect<QueueTask, ForgeError, never>;
    cancel(tenant: string, id: string): Effect.Effect<QueueTask, ForgeError, never>;
    reapExpired(tenant: string): Effect.Effect<number, ForgeError, never>;
    get(tenant: string, id: string): Effect.Effect<QueueTask, ForgeError>;
}
