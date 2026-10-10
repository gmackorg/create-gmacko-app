import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class AccessGovernance {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private now;
    private support;
    private find;
    private request;
    private approved;
    issue(request: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    private review;
    private history;
    explain(grant: string, at: string, ctx: CallContext): Effect.Effect<{
        grant: any;
        history: Wire[];
        end: Wire | null;
        reviewDue: string;
        reasons: string[];
        effective: boolean;
        request: any;
        identity: any;
        root: any;
        chain: Wire[];
    }, ForgeError, never>;
    complete(reviewId: string, input: {
        outcome: 'continued' | 'modified' | 'revoked';
        certification: string;
        nextReviewAt: string;
        acceptsConflicts?: boolean;
        replacement?: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<Wire[], ForgeError, never>;
    pip(grant: string, subject: string, ctx: CallContext): Effect.Effect<{
        pip: string;
        attribute: string;
        value: boolean;
        observedAt: string;
        expiresAt: string;
        subject: string;
        scope: any;
        right: any;
        purpose: {} | null;
        constraints: any;
        reasons: string[];
        delegationChain: unknown[];
    }, ForgeError, never>;
}
