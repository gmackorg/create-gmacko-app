import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Maintenance {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private support;
    inspect(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        asset: import("./asset-lifecycle.js").AssetState;
        demand: {
            row: any;
            resolution: Wire | null;
            phase: string;
        };
        execution: {
            phase: string;
            coverage: string;
            end: Wire;
        } | {
            phase: string;
            coverage: string;
            end: null;
        };
        qualification: {
            qualified: boolean;
            qualification: string | null;
        };
        operation: {
            phase: string;
            cleanupPending: boolean;
        } | null;
        usage: import("./usage.js").UsageProjection | null;
        parts: Wire[];
        approval: import("./decision.js").DecisionState;
        finish: Wire | null;
    }, ForgeError, never>;
    finish(input: {
        order: string;
        inspection: string;
        evidence: string;
        returnToService?: string;
        followUp?: string;
        at: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    history(asset: string, ctx: CallContext): Effect.Effect<Wire[], ForgeError>;
}
