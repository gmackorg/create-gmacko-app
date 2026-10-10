import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
/** Read-only allowance decisions. A caller must atomically enforce at execution. */
export declare class Quotas {
    private readonly engine;
    constructor(engine: Engine);
    inspect(allowance: string, at: string, ctx: CallContext, requested?: string): Effect.Effect<{
        allowance: string;
        grant: string;
        scope: string;
        dimension: string;
        unit: string;
        from: string;
        until: string;
        through: string;
        limit: string;
        used: string;
        reserved: string;
        remaining: string;
        requested: string;
        projected: string;
        exceeded: boolean;
        decision: "Warn" | "Prohibit" | "WithinLimit";
        usageEventIds: string[];
        allocationHead: string | null;
        reservationIds: string[];
    }, import("../errors.js").ForgeError, never>;
}
