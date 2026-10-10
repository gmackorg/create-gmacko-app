import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
import { type SettlementAdmission } from './settlement.js';
/** Profile validates accounting treatment or external recovery scope. Neither implies payment. */
export type CollectionDispositionAdmission = (disposition: Wire, position: Wire, ctx: CallContext) => Effect.Effect<void, ForgeError>;
export declare class Collections {
    private readonly engine;
    private readonly admission;
    private readonly dispositionAdmission?;
    constructor(engine: Engine, admission: SettlementAdmission, dispositionAdmission?: CollectionDispositionAdmission | undefined);
    private call;
    private read;
    private support;
    state(id: string, instant: string, ctx: CallContext, knownAt?: string): Effect.Effect<{
        row: any;
        policy: any;
        activity: import("./case-management.js").CaseState;
        position: Wire;
        ageDays: number;
        stage: string;
    }, ForgeError, never>;
    notice(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        state: {
            row: any;
            policy: any;
            activity: import("./case-management.js").CaseState;
            position: Wire;
            ageDays: number;
            stage: string;
        };
        outcome: {
            status: string;
            intent: string | null;
        };
    }, ForgeError, never>;
    promise(id: string, instant: string, ctx: CallContext): Effect.Effect<{
        row: any;
        baseline: {
            row: any;
            policy: any;
            activity: import("./case-management.js").CaseState;
            position: Wire;
            ageDays: number;
            stage: string;
        };
        current: {
            row: any;
            policy: any;
            activity: import("./case-management.js").CaseState;
            position: Wire;
            ageDays: number;
            stage: string;
        };
        paid: string;
        status: string;
    }, ForgeError, never>;
    dispute(id: string, at: string, ctx: CallContext): Effect.Effect<{
        row: any;
        state: {
            row: any;
            policy: any;
            activity: import("./case-management.js").CaseState;
            position: Wire;
            ageDays: number;
            stage: string;
        };
        dispute: {
            row: Wire;
            contested: Wire;
        };
    }, ForgeError, never>;
    disposition(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        state: {
            row: any;
            policy: any;
            activity: import("./case-management.js").CaseState;
            position: Wire;
            ageDays: number;
            stage: string;
        };
    }, ForgeError, never>;
    closure(id: string, at: string, ctx: CallContext): Effect.Effect<{
        row: any;
        historical: {
            row: any;
            policy: any;
            activity: import("./case-management.js").CaseState;
            position: Wire;
            ageDays: number;
            stage: string;
        };
        current: {
            row: any;
            policy: any;
            activity: import("./case-management.js").CaseState;
            position: Wire;
            ageDays: number;
            stage: string;
        };
        effective: boolean;
    }, ForgeError, never>;
}
