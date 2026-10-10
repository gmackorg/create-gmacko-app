/**
 * DynamoDB storage adapter (plan §11), following the protocol certified by
 * the M0 spike: entity + unique claims + strong access items + audit + outbox
 * + receipt in one TransactWriteItems; bounded retry of TransactionConflict;
 * ClientRequestToken derived from the operation id.
 */
import { DynamoDBClient } from "@aws-sdk/client-dynamodb";
import { Effect } from "effect";
import { type ForgeError } from "../errors.js";
import { type Model, type Resource, type Unique } from "../model.js";
import type { AtomicAbsenceGuard, DocumentWrite, CommitPlan, IntervalGuard, ListQuery, OutboxRow, Receipt, StorageAdapter, StoredRecord } from "../services.js";
export declare const PENDING_INDEX = "pending-index";
export interface DynamoOptions {
    table: string;
    region?: string;
    client?: DynamoDBClient;
}
/** Create the single data table + sparse pending index (idempotent). Deployment-time, never request-time. */
export declare function ensureDynamoTable(table: string, region: string): Promise<void>;
export declare class DynamoStorage implements StorageAdapter {
    private readonly model;
    readonly atomicAbsenceGuards = true;
    readonly atomicCompletion = true;
    readonly name = "dynamodb";
    private readonly doc;
    private readonly table;
    constructor(opts: DynamoOptions, model: Model);
    private wire;
    private entityKey;
    private claimKey;
    private accessPk;
    private accessSk;
    private auditKey;
    private outboxKey;
    private receiptKey;
    private wrap;
    private toStored;
    get(tenant: string, r: Resource, id: string): Effect.Effect<StoredRecord | null, ForgeError>;
    findUnique(tenant: string, r: Resource, u: Unique, _claimKey: string, values: Record<string, unknown>): Effect.Effect<StoredRecord | null, ForgeError>;
    list(tenant: string, r: Resource, q: ListQuery, _sortKeys: (rec: StoredRecord) => string[]): Effect.Effect<{
        records: StoredRecord[];
        hasMore: boolean;
    }, ForgeError>;
    /**
     * Restrict-delete on DynamoDB uses a per-(child, field) live-dependent counter on the parent
     * entity (`dep#<child>#<field>`), maintained in the child's transaction (plan §11.4). The
     * pre-check reads it; the delete transaction conditions on it being zero or absent.
     */
    countDependents(tenant: string, child: Resource, field: string, id: string): Effect.Effect<number, ForgeError>;
    getReceipt(tenant: string, operation: string, key: string): Effect.Effect<Receipt | null, ForgeError>;
    /** Interval rows of a group live under one partition (ordered by effectiveFrom) so neighbours are one bounded query. */
    private intervalPk;
    private groupGuardKey;
    private groupRows;
    private overlaps;
    overlapping(tenant: string, r: Resource, g: IntervalGuard): Effect.Effect<StoredRecord[], ForgeError>;
    effectiveAt(tenant: string, r: Resource, _groupFields: string[], groupValues: unknown[], at: string): Effect.Effect<StoredRecord | null, ForgeError>;
    /** Children of a node live under a per-parent partition (an access family maintained in the entity transaction). */
    private childPk;
    children(tenant: string, r: Resource, _parentField: string, id: string, limit: number): Effect.Effect<StoredRecord[], ForgeError>;
    private outboxRowOf;
    /** A marker item per tenant in the "ALL" shard lets the sweep enumerate tenants with recent outbox activity. */
    private tenantMarker;
    /** Tenants with outbox activity (markers in the ALL shard; harmless if a tenant has nothing pending). */
    outboxTenants(): Effect.Effect<string[], ForgeError>;
    outboxSweep(tenant: string, now: number, limit: number): Effect.Effect<OutboxRow[], ForgeError>;
    private conditional;
    outboxClaim(r: {
        tenant: string;
        opId: string;
        ordinal: number;
    }, owner: string, now: number, leaseMs: number): Effect.Effect<boolean, ForgeError>;
    outboxProgress(r: {
        tenant: string;
        opId: string;
        ordinal: number;
    }, owner: string, u: {
        delivered: string[];
        done?: boolean;
        dead?: boolean;
        releaseLease?: boolean;
    }): Effect.Effect<boolean, ForgeError>;
    outboxDead(tenant: string): Effect.Effect<OutboxRow[], ForgeError>;
    outboxRedrive(r: {
        tenant: string;
        opId: string;
        ordinal: number;
    }): Effect.Effect<boolean, ForgeError>;
    hasProcessed(tenant: string, subscription: string, messageId: string): Effect.Effect<boolean, ForgeError>;
    markProcessed(tenant: string, subscription: string, messageId: string): Effect.Effect<boolean, ForgeError>;
    private documentKey;
    /** Entities have per-item partitions, so an export is a filtered Scan: admin-only, run behind the write fence. */
    exportPage(tenant: string, r: Resource, cursor: string | null, limit: number): Effect.Effect<{
        records: StoredRecord[];
        next: string | null;
    }, ForgeError>;
    getDocument(tenant: string, kind: string, id: string): Effect.Effect<Record<string, unknown> | null, ForgeError>;
    putDocuments(tenant: string, writes: DocumentWrite[]): Effect.Effect<void, ForgeError>;
    putDocument(tenant: string, kind: string, id: string, doc: Record<string, unknown>, expectedVersion: number | null): Effect.Effect<void, ForgeError>;
    budget(plans: CommitPlan[], absent?: readonly AtomicAbsenceGuard[]): {
        actions: number;
        limit: number;
    };
    commit(plan: CommitPlan): Effect.Effect<void, ForgeError>;
    /** Assemble the physical transaction once for both budgeting and execution.
     * Shared reference counters commute; preserve every condition while combining
     * their deltas. Any other duplicate physical target is unsupported. */
    private transaction;
    commitAll(plans: CommitPlan[], absent?: readonly AtomicAbsenceGuard[]): Effect.Effect<void, ForgeError>;
    private buildTransaction;
    /** The engine encodes claim keys as identity(resourceId, unique, ...values); map to the physical key. */
    private claimKeyFromEncoded;
    private send;
    private classify;
}
