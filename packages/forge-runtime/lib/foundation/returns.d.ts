import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
import { type SettlementAdmission } from './settlement.js';
export declare class Returns {
    private readonly engine;
    private readonly settlementAdmission?;
    constructor(engine: Engine, settlementAdmission?: SettlementAdmission | undefined);
    private call;
    private movement;
    private request;
    claims(origin: string, ctx: CallContext): Effect.Effect<{
        events: Wire[];
        quantity: string;
    }, ForgeError>;
    authorize(request: string, previous: string | null, at: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    receipt(id: string, ctx: CallContext): Effect.Effect<{
        receipt: any;
        request: any;
        origin: any;
        received: {
            row: any;
            position: {
                row: any;
                unit: string;
                onHand: string;
                reserved: string;
                available: string;
                reorderGap: string;
                head: {} | null;
                events: Wire[];
            };
        };
    }, ForgeError, never>;
    disposition(id: string, ctx: CallContext): Effect.Effect<{
        result: Wire;
        receipt: any;
        request: any;
        origin: any;
        received: {
            row: any;
            position: {
                row: any;
                unit: string;
                onHand: string;
                reserved: string;
                available: string;
                reorderGap: string;
                head: {} | null;
                events: Wire[];
            };
        };
        row: any;
    }, ForgeError, never>;
    remedy(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        disposition: {
            result: Wire;
            receipt: any;
            request: any;
            origin: any;
            received: {
                row: any;
                position: {
                    row: any;
                    unit: string;
                    onHand: string;
                    reserved: string;
                    available: string;
                    reorderGap: string;
                    head: {} | null;
                    events: Wire[];
                };
            };
            row: any;
        };
    }, ForgeError, never>;
}
