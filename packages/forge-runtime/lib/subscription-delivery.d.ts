/** Durable inbox protocol. Document versions are fencing tokens, not just locks. */
import { Effect } from "effect";
import { ForgeError } from "./errors.js";
import type { DocumentWrite, StorageAdapter } from "./services.js";
export declare class SubscriptionDelivery {
    private readonly storage;
    private readonly tenant;
    private readonly id;
    private version;
    private readonly state;
    private readonly now;
    private externalStarted;
    private externalIntent;
    private constructor();
    static claim(storage: StorageAdapter, tenant: string, subscription: string, messageId: string, requestHash: string, now: () => number): Promise<SubscriptionDelivery | null>;
    /** Persist intent BEFORE an external effect; expired ambiguous work is never replayed automatically. */
    beforeExternal(): Effect.Effect<void, ForgeError, never>;
    completion(): DocumentWrite;
    failed(): Promise<void>;
}
