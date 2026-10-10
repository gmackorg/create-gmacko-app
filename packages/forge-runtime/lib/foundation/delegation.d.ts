import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Delegations {
    private readonly engine;
    constructor(engine: Engine);
    explain(id: string, at: string, ctx: CallContext): Effect.Effect<{
        delegation: Wire;
        root: Wire;
        chain: Wire[];
        effective: boolean;
        reasons: string[];
    }, ForgeError>;
    pip(id: string, subject: string, ctx: CallContext): Effect.Effect<{
        subject: string;
        scope: unknown;
        right: unknown;
        purpose: unknown;
        effective: boolean;
        chain: unknown[];
        root: unknown;
        reasons: string[];
        pip: string;
        attribute: string;
        value: boolean;
        observedAt: string;
        expiresAt: string;
    }, ForgeError, never>;
    revoke(delegation: string, effectiveAt: string, reason: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    assurance(id: string, subject: string, at: string, ctx: CallContext): Effect.Effect<{
        subject: string;
        scope: unknown;
        right: unknown;
        purpose: unknown;
        effective: boolean;
        chain: unknown[];
        root: unknown;
        reasons: string[];
    }, ForgeError, never>;
}
