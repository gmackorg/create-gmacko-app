import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
export interface AttestationInput {
    issuer: string;
    subject: string;
    issuerRecord: string;
    specification: string;
    issuedAt: string;
    validFrom: string;
    validUntil?: string;
    conclusion: string;
    source: string;
    support?: string;
    proof?: string;
}
/** Assertions are independent of evaluations, findings and cryptographic formats. */
export declare class Attestations {
    private readonly engine;
    constructor(engine: Engine);
    private dependencies;
    issue(input: AttestationInput, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    end(attestation: string, effectiveAt: string, reason: string, ctx: CallContext, replacement?: string): Effect.Effect<any, ForgeError, never>;
    read(id: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    current(id: string, at: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    qualification(link: string, at: string, ctx: CallContext): Effect.Effect<{
        qualification: any;
        attestation: any;
        valid: boolean;
    }, ForgeError, never>;
}
