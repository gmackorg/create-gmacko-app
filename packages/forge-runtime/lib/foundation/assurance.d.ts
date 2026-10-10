import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export type DispositionKind = "Remediate" | "Accepted" | "FalsePositive" | "Waived" | "Deferred";
export declare class Assurance {
    private readonly engine;
    constructor(engine: Engine);
    disposition(finding: string, kind: DispositionKind, reason: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    findingPhase(finding: string, ctx: CallContext): Effect.Effect<string, ForgeError>;
    remediationPhase(remediation: string, ctx: CallContext): Effect.Effect<string, ForgeError>;
    issue(input: {
        finding: string;
        attestation: string;
        finish: string;
        run: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    end(id: string, effectiveAt: string, reason: string, ctx: CallContext, replacement?: string): Effect.Effect<any, ForgeError, never>;
    current(id: string, at: string, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
    private support;
}
