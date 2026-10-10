/**
 * In-memory storage adapter: the deterministic semantic model every other
 * adapter is compared against (plan §26). Single-threaded, so "atomic" is
 * trivially true; the semantics (version guard, claims, references, soft
 * delete retention, ordering) are the contract.
 */
import { Effect } from "effect";
import { type ForgeError } from "../errors.js";
import type { Resource, Unique } from "../model.js";
import type { AtomicAbsenceGuard, DocumentWrite, CommitPlan, IntervalGuard, ListQuery, OutboxRow, Receipt, StorageAdapter, StoredRecord } from "../services.js";
export declare class MemoryStorage implements StorageAdapter {
    readonly name = "memory";
    readonly atomicAbsenceGuards = true;
    readonly atomicCompletion = true;
    private tables;
    private claims;
    private audits;
    private outbox;
    private processed;
    private receipts;
    private documents;
    private table;
    get(tenant: string, r: Resource, id: string): Effect.Effect<StoredRecord | null, ForgeError>;
    findUnique(tenant: string, r: Resource, _u: Unique, claimKey: string, _values: Record<string, unknown>): Effect.Effect<StoredRecord | null, ForgeError>;
    list(tenant: string, r: Resource, q: ListQuery, sortKeys: (rec: StoredRecord) => string[]): Effect.Effect<{
        records: StoredRecord[];
        hasMore: boolean;
    }, ForgeError>;
    countDependents(tenant: string, child: Resource, field: string, id: string): Effect.Effect<number, ForgeError>;
    getReceipt(tenant: string, operation: string, key: string): Effect.Effect<Receipt | null, ForgeError>;
    private overlapSync;
    overlapping(tenant: string, r: Resource, g: IntervalGuard): Effect.Effect<StoredRecord[], ForgeError>;
    effectiveAt(tenant: string, r: Resource, groupFields: string[], groupValues: unknown[], at: string): Effect.Effect<StoredRecord | null, ForgeError>;
    children(tenant: string, r: Resource, parentField: string, id: string, limit: number): Effect.Effect<StoredRecord[], ForgeError>;
    private row;
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
    /** Validate every plan against durable state first, then apply all: single-threaded, so atomic. */
    commitAll(plans: CommitPlan[], absent?: readonly AtomicAbsenceGuard[]): Effect.Effect<void, ForgeError>;
    commit(plan: CommitPlan): Effect.Effect<void, ForgeError>;
    private commitSync;
    /** Test helper. */
    dump(tenant: string): Promise<Record<string, any[]>>;
    static claimKey(resource: string, unique: string, values: string[]): string;
}
