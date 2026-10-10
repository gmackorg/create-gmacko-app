import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
export declare class Onboarding {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private read;
    private support;
    private work;
    inspect(id: string, instant: string, ctx: CallContext): Effect.Effect<{
        row: any;
        activity: import("./case-management.js").CaseState;
        gates: Wire[];
        head: string;
    }, import("../errors.js").ForgeError, never>;
    activate(input: {
        onboarding: string;
        at: string;
        support: string;
    }, ctx: CallContext): Effect.Effect<any, import("../errors.js").ForgeError, never>;
    activation(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        onboarding: {
            row: any;
            activity: import("./case-management.js").CaseState;
            gates: Wire[];
            head: string;
        };
    }, import("../errors.js").ForgeError, never>;
    completion(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        offboarding: any;
        activation: {
            row: any;
            onboarding: {
                row: any;
                activity: import("./case-management.js").CaseState;
                gates: Wire[];
                head: string;
            };
        };
        retention: {
            record: any;
            rule: any;
            events: Wire[];
            holds: Map<string, Wire>;
            disposed: boolean;
        };
    }, import("../errors.js").ForgeError, never>;
}
