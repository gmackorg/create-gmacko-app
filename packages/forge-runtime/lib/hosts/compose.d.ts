import { Dispatcher, type Transport } from "../dispatch.js";
import { Engine, type EngineOptions } from "../engine.js";
import { Model, type AppBundle } from "../model.js";
import type { RealtimeHub } from "../realtime.js";
import { type ObjectStoreAdapter, type StorageAdapter } from "../services.js";
import type { TelemetrySink } from "../telemetry.js";
import type { WorkflowDriver } from "../workflows.js";
/** Named capability axes (plan §5.1). Re-exported so callers depend on the interface, not the adapter. */
export type StructuredStore = StorageAdapter;
export type ObjectStore = ObjectStoreAdapter;
export type ChannelTransport = Transport;
export type { RealtimeHub, WorkflowDriver };
export interface RuntimeComposition extends EngineOptions {
    bundle: AppBundle;
    store: StructuredStore;
    objects?: ObjectStore;
    /** Where deliveries for subscriptions the process does not consume itself go (queues); default: in-process only. */
    transport?: ChannelTransport;
    workflowDriver?: WorkflowDriver;
    realtimeHub?: RealtimeHub;
    telemetry?: {
        sink: TelemetrySink;
        target: string;
    };
    cursorSecret: string;
    clock?: () => string;
    /** Host subscriptions (queue-backed); internal consumers (projections, workflows, realtime) are merged in. */
    subscriptions?: Record<string, string[]>;
    leaseMs?: number;
    maxAttempts?: number;
}
export interface ComposedRuntime {
    model: Model;
    engine: Engine;
    store: StructuredStore;
    dispatcher: Dispatcher;
    /** One durable sweep: outbox deliveries, crashed workflow instances, due schedule occurrences. */
    sweep(tenant: string, now?: number): Promise<void>;
    sweepAll(now?: number): Promise<void>;
}
export declare function composeRuntime(c: RuntimeComposition): ComposedRuntime;
/**
 * Assurance profiles (plan §10.4, PAR-114). A shared process can only offer `workload-bound`:
 * the callee trusts the workload's dispatcher to name the function, so a compromised workload can
 * impersonate a sibling. `isolated-callable` needs an attested execution boundary the deployment
 * actually provides; a request for it from a shared process is downgraded, never granted.
 */
export type AssuranceLevel = "workload-bound" | "isolated-callable";
export declare function assuranceProfile(deployment: {
    isolation: "shared-process" | "attested-boundary";
    attestation?: string;
}, requested: AssuranceLevel): {
    requested: AssuranceLevel;
    granted: AssuranceLevel;
    reason?: string;
};
