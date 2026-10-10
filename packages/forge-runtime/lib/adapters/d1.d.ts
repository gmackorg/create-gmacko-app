/**
 * Cloudflare D1 storage adapter (plan §10). One `batch()` per logical
 * command; every precondition is evaluated inside the batch through the
 * assertion table's named CHECK, as certified by the M0 spike.
 */
import { Effect } from "effect";
import { type ForgeError } from "../errors.js";
import type { Model, Resource, Unique } from "../model.js";
import type { AtomicAbsenceGuard, DocumentWrite, CommitPlan, IntervalGuard, ListQuery, OutboxRow, Receipt, StorageAdapter, StoredRecord } from "../services.js";
import { type SqlExecutor } from "./sql-executor.js";
/** Minimal structural type for the D1 binding so this module has no hard dependency on workers-types. */
export interface D1Like {
    prepare(sql: string): D1Stmt;
    batch(statements: D1Stmt[]): Promise<{
        results?: unknown[];
        meta?: {
            changes?: number;
        };
    }[]>;
}
export interface D1Stmt {
    bind(...values: unknown[]): D1Stmt;
    first<T = unknown>(): Promise<T | null>;
    all<T = unknown>(): Promise<{
        results: T[];
    }>;
    run(): Promise<{
        meta: {
            changes: number;
        };
    }>;
}
export declare class D1Storage implements StorageAdapter {
    readonly name: string;
    readonly atomicAbsenceGuards = true;
    readonly atomicCompletion = true;
    private readonly map;
    private readonly db;
    /** Accepts a raw D1 binding or any SqlExecutor facade over one. */
    constructor(db: D1Like | SqlExecutor, model: Model);
    private keyWhere;
    private wrap;
    get(tenant: string, r: Resource, id: string): Effect.Effect<StoredRecord | null, ForgeError>;
    findUnique(tenant: string, r: Resource, u: Unique, _claimKey: string, values: Record<string, unknown>): Effect.Effect<StoredRecord | null, ForgeError>;
    list(tenant: string, r: Resource, q: ListQuery, _sortKeys: (rec: StoredRecord) => string[]): Effect.Effect<{
        records: StoredRecord[];
        hasMore: boolean;
    }, ForgeError>;
    private afterValue;
    countDependents(tenant: string, child: Resource, field: string, id: string): Effect.Effect<number, ForgeError>;
    /** SQL for "a live row of the group overlaps [from, until)". Half-open: a.from < b.until AND b.from < a.until. */
    private overlapSql;
    overlapping(tenant: string, r: Resource, g: IntervalGuard): Effect.Effect<StoredRecord[], ForgeError>;
    effectiveAt(tenant: string, r: Resource, groupFields: string[], groupValues: unknown[], at: string): Effect.Effect<StoredRecord | null, ForgeError>;
    children(tenant: string, r: Resource, parentField: string, id: string, limit: number): Effect.Effect<StoredRecord[], ForgeError>;
    private outboxRow;
    outboxTenants(): Effect.Effect<string[], ForgeError>;
    outboxSweep(tenant: string, now: number, limit: number): Effect.Effect<OutboxRow[], ForgeError>;
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
    getReceipt(tenant: string, operation: string, key: string): Effect.Effect<Receipt | null, ForgeError>;
    budget(plans: CommitPlan[], absent?: readonly AtomicAbsenceGuard[]): {
        actions: number;
        limit: number;
    };
    exportPage(tenant: string, r: Resource, cursor: string | null, limit: number): Effect.Effect<{
        records: StoredRecord[];
        next: string | null;
    }, ForgeError>;
    getDocument(tenant: string, kind: string, id: string): Effect.Effect<Record<string, unknown> | null, ForgeError>;
    putDocuments(tenant: string, writes: DocumentWrite[]): Effect.Effect<void, ForgeError>;
    putDocument(tenant: string, kind: string, id: string, doc: Record<string, unknown>, expectedVersion: number | null): Effect.Effect<void, ForgeError>;
    commit(plan: CommitPlan): Effect.Effect<void, ForgeError>;
    /**
     * How many times a transient conflict is re-attempted, and how long to wait between attempts.
     * Both are overridable because the right budget is a property of the engine's concurrency
     * control, not of this protocol: a single-writer store conflicts rarely, a store using
     * serializable snapshot isolation conflicts whenever independent writers overlap.
     */
    protected readonly retryAttempts: number;
    /** PostgreSQL can let the primary key arbitrate create collisions without an SSI absence read. */
    protected readonly assertCreateAbsent: boolean;
    protected retryDelayMs(attempt: number): number;
    commitAll(plans: CommitPlan[], absent?: readonly AtomicAbsenceGuard[]): Effect.Effect<void, ForgeError>;
    private commitOnce;
    private absenceQuery;
    /** Statements for one logical command; several commands concatenate into one atomic batch. */
    private statementsFor;
    /** Provider error -> stable outcome. The named CHECK identifies a failed precondition; a diagnostic read says which. */
    private classify;
}
