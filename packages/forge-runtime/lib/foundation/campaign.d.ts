import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
/** A host must evaluate the pinned audience selector and channel policy at the notice instant.
 * Returning true is an explicit domain assertion, not interpretation of SpecificationPin text. */
export type CampaignAdmission = (audience: Wire, route: Wire, subscription: Wire, at: string, ctx: CallContext) => Effect.Effect<boolean, ForgeError>;
export declare class Campaigns {
    private readonly engine;
    private readonly admit;
    constructor(engine: Engine, admit: CampaignAdmission);
    private call;
    private read;
    private indexed;
    state(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        audience: any;
        budget: import("./planning-budget.js").BudgetState | null;
        events: Wire[];
        head: {} | null;
        phase: {};
    }, ForgeError, never>;
    private batch;
    act(input: {
        campaign: string;
        previous: string | null;
        kind: 'activate' | 'pause' | 'resume' | 'wave' | 'close';
        at: string;
        wave?: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    /** Admission is a durable snapshot. Pause stops new waves; it does not cancel admitted deliveries.
     * Hosts call this before dispatch; no external messages are sent by this service. */
    wave(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        campaign: {
            row: any;
            audience: any;
            budget: import("./planning-budget.js").BudgetState | null;
            events: Wire[];
            head: {} | null;
            phase: {};
        };
        members: Wire[];
    }, ForgeError, never>;
    response(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        wave: {
            row: any;
            campaign: {
                row: any;
                audience: any;
                budget: import("./planning-budget.js").BudgetState | null;
                events: Wire[];
                head: {} | null;
                phase: {};
            };
            members: Wire[];
        };
        event: any;
    }, ForgeError, never>;
    performance(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        campaign: {
            row: any;
            audience: any;
            budget: import("./planning-budget.js").BudgetState | null;
            events: Wire[];
            head: {} | null;
            phase: {};
        };
        assessment: {
            row: any;
            objective: any;
            observation: Wire;
            actual: string;
            expected: string;
            variance: string;
            status: "breached" | "met";
        };
    }, ForgeError, never>;
}
