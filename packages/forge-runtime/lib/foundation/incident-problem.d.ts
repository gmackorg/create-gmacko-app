import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
export declare class Incidents {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private support;
    incident(id: string, at: string, ctx: CallContext): Effect.Effect<{
        row: any;
        activity: import("./case-management.js").CaseState;
        serviceLevel: import("./service-level.js").ServiceState | null;
    }, import("../errors.js").ForgeError, never>;
    problem(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        activity: import("./case-management.js").CaseState;
    }, import("../errors.js").ForgeError, never>;
    correlation(id: string, at: string, ctx: CallContext): Effect.Effect<{
        row: any;
        incident: {
            row: any;
            activity: import("./case-management.js").CaseState;
            serviceLevel: import("./service-level.js").ServiceState | null;
        };
        problem: {
            row: any;
            activity: import("./case-management.js").CaseState;
        };
    }, import("../errors.js").ForgeError, never>;
    known(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        problem: {
            row: any;
            activity: import("./case-management.js").CaseState;
        };
        diagnosis: Wire;
    }, import("../errors.js").ForgeError, never>;
    verification(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        remediation: any;
        problem: {
            row: any;
            activity: import("./case-management.js").CaseState;
        };
        evaluation: Wire;
    }, import("../errors.js").ForgeError, never>;
    resolution(id: string, at: string, ctx: CallContext): Effect.Effect<{
        row: any;
        correlation: {
            row: any;
            incident: {
                row: any;
                activity: import("./case-management.js").CaseState;
                serviceLevel: import("./service-level.js").ServiceState | null;
            };
            problem: {
                row: any;
                activity: import("./case-management.js").CaseState;
            };
        };
        verification: {
            row: any;
            remediation: any;
            problem: {
                row: any;
                activity: import("./case-management.js").CaseState;
            };
            evaluation: Wire;
        };
        current: boolean;
    }, import("../errors.js").ForgeError, never>;
}
