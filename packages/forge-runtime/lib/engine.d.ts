/**
 * One mutation engine for every interface (plan §9). Operations are resolved
 * by stable id, inputs decoded through the common pipeline, and every write
 * becomes a CommitPlan executed atomically by the storage adapter.
 */
import { Effect, Layer } from "effect";
import { type Wire } from "./decode.js";
import { ForgeError } from "./errors.js";
import { type List, type Model, type Resource, type Unique } from "./model.js";
import { type ClaimChange, type CommitPlan, type ReferenceGuard, type RuntimeServices, type StoredRecord } from "./services.js";
import { Changesets } from "./changeset.js";
import { Blobs } from "./blobs.js";
import { Imports } from "./imports.js";
import { Functions, type ExternalBinding, type FunctionImpl } from "./functions.js";
import { Temporal } from "./temporal.js";
import { ReadModels } from "./readmodels.js";
import { Workflows } from "./workflows.js";
import { Schedules } from "./schedules.js";
import { Realtime } from "./realtime.js";
import { Telemetry, type TraceContext } from "./telemetry.js";
import { Portability } from "./portability.js";
import { Governance } from "./governance.js";
import { Scope } from "./scope.js";
import { Gatekeeper } from "./gatekeeper.js";
import { Suppression } from "./suppression.js";
import type { Transport } from "./dispatch.js";
import type { Envelope } from "./dispatch.js";
export interface CallContext {
    tenant: string;
    actor: string;
    requestId: string;
    idempotencyKey?: string;
    /** W3C trace context for this logical operation (its own span; the request's span is the parent). */
    trace?: TraceContext;
    /** Edition 2027: the purpose surface this invocation runs under (one purpose; never a union). */
    purpose?: string;
    /** Retry number of this logical request as seen by the caller (telemetry denominators, PAR-166). */
    attempt?: number;
    /** Privileged maintenance context (seeding, migration): bypasses purpose scoping; audited by actor. */
    maintenance?: boolean;
}
export declare const PAGE_DEFAULT = 50;
export declare const PAGE_MAX = 100;
export declare function sha256(text: string): Promise<string>;
/** Stable JSON for request hashing (sorted keys). */
export declare function stableJson(v: unknown): string;
export interface AtomicMutation {
    operation: string;
    input: Wire;
}
export interface AtomicOptions {
    /** Unconditional unique keys on append-only resources. Absence is checked at commit,
     * including facts the caller could not see through a row-filtered query. Requires
     * read authorization for the finder without a current record (fails closed). */
    absent?: readonly {
        resource: string;
        unique: string;
        values: Wire;
    }[];
}
export interface EngineOptions {
    secrets?: import("./credentials.js").SecretAdapter;
    functions?: FunctionImpl[];
    externals?: Record<string, ExternalBinding>;
}
export declare class Engine {
    readonly model: Model;
    readonly layer: Layer.Layer<RuntimeServices>;
    readonly functions: Functions;
    private readonly secrets;
    constructor(model: Model, layer: Layer.Layer<RuntimeServices>, options?: EngineOptions);
    call(opId: string, input: unknown, ctx: CallContext): Effect.Effect<any, ForgeError>;
    private successStatus;
    /** Same as call() but without providing the layer (for use inside function bodies that share it). */
    callInternal(opId: string, input: unknown, ctx: CallContext): Effect.Effect<any, ForgeError, RuntimeServices>;
    consume(subscription: string, env: Envelope): Promise<"processed" | "duplicate" | "unknown-subscription">;
    private program;
    /** A resource operation under a purpose surface: authority checked first, result projected last (plan §8.4–8.5). */
    private scopedOperation;
    private operation;
    /** Views (`.query`), projections (`.get|.status|.rebuild`) and caches (`.read`). */
    private readModel;
    /** Build the commit plan for a mutation without persisting it (used by single calls and changeset preview). */
    planFor(opId: string, body: Wire, ctx: CallContext, preview?: boolean): Effect.Effect<CommitPlan, ForgeError, RuntimeServices>;
    /** Canonical public result of a committed plan. */
    resultOf(plan: CommitPlan): Wire;
    /** Authorized, bounded composition of independent mutations against durable references.
     * No staged reads/references or repeated-record composition is implied. Callers
     * use immutable unique publication facts for retries; receipt keys are rejected. */
    atomic(mutations: readonly AtomicMutation[], ctx: CallContext, options?: AtomicOptions): Effect.Effect<Wire[], ForgeError>;
    private authorizedPlan;
    private mutate;
    readonly changesets: Changesets;
    readonly blobs: Blobs;
    readonly temporal: Temporal;
    readonly imports: Imports;
    readonly readModels: ReadModels;
    readonly workflows: Workflows;
    readonly schedules: Schedules;
    readonly realtime: Realtime;
    readonly telemetry: Telemetry;
    readonly portability: Portability;
    readonly governance: Governance;
    readonly scope: Scope;
    readonly gatekeeper: Gatekeeper;
    readonly suppression: Suppression;
    /** Test hook: advance the deterministic test clock (no effect with production clocks). */
    testClockJump(ms: number): void;
    /** Every projection is one durable logical subscription on its source's change channel. */
    projectionSubscriptions(base?: Record<string, string[]>): Record<string, string[]>;
    /** In-process transport that applies change events to projections (the cloud hosts route queue batches here). */
    projectionTransport(): Transport;
    applyProjectionEvent(projectionId: string, env: Envelope): Promise<"applied" | "stale" | "ignored">;
    claimKey(r: Resource, u: Unique, rec: Wire): string | null;
    /** Claims and guards for an imported record (plan §22): the same rules a create would apply. */
    claimChangesFor(r: Resource, rec: Wire): ClaimChange[];
    referenceGuardsFor(r: Resource, rec: Wire): ReferenceGuard[];
    private claimChanges;
    /** Resolve `$self` reference inputs to the written record's id; only a same-resource reference may use it. */
    private resolveSelfReferences;
    private referenceGuards;
    /** Load referenced records (for rules) and verify they exist in this tenant and are live. */
    private loadReferences;
    private checkRules;
    private expectedVersion;
    private loadCurrent;
    private audit;
    /** Audited resources stage one change event per commit on their implicit `<Resource>.changes` channel. */
    private changeEvent;
    private sealSecrets;
    private create;
    private get;
    private queryValues;
    private find;
    sortKeys(r: Resource, l: List): (rec: StoredRecord) => string[];
    private list;
    private update;
    private deleteOrRestore;
    private transition;
    /** Run a mutation under an idempotency receipt: replay on the same key + request, conflict on a different request. */
    withIdempotency(operation: string, body: Wire, ctx: CallContext, run: Effect.Effect<Wire, ForgeError, RuntimeServices>, explicitKey?: string): Effect.Effect<Wire, ForgeError, RuntimeServices>;
}
