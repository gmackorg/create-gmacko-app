import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
/** Qualification is a business fact; matching a requirement never grants authority. */
export declare class Qualifications {
    private readonly engine;
    constructor(engine: Engine);
    award(input: {
        subject: string;
        definition: string;
        level?: string;
        issuer: string;
        issuerRecord: string;
        issuedAt: string;
        expiresAt?: string;
        support?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    revoke(qualification: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    private readSupport;
    /** Bounded full lookup, consuming storage cursors rather than treating page one
     * as definitive. Domain rank order is comparable only within an exact definition. */
    satisfies(subject: string, requirement: string, at: string, ctx: CallContext): Effect.Effect<{
        qualified: boolean;
        qualification: string | null;
    }, ForgeError>;
}
