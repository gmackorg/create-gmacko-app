/** Durable journal for D1-compatible SQL executors. No expiry or lease takeover. */
import type { SqlExecutor } from "./sql-executor.js";
import { type ArtifactPublicationIntent, type ArtifactPublicationJournal, type ArtifactPublicationReceipt } from "../artifact-publication.js";
export declare class SqlArtifactPublicationJournal implements ArtifactPublicationJournal {
    private readonly sql;
    constructor(sql: SqlExecutor);
    /** Explicit migration hook; call during provisioning, not on a request path. */
    initialize(): Promise<void>;
    get(intent: ArtifactPublicationIntent): Promise<ArtifactPublicationReceipt | null>;
    claim(intent: ArtifactPublicationIntent): Promise<{
        owned: boolean;
        receipt: ArtifactPublicationReceipt;
    }>;
    finish(intent: ArtifactPublicationIntent, outcome: Exclude<ArtifactPublicationReceipt["outcome"], "pending">): Promise<ArtifactPublicationReceipt>;
}
