import { Effect } from 'effect';
import { type Engine, type CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
import { type SettlementAdmission } from './settlement.js';
export interface ChargeInput {
    period: string;
    sourceKey: string;
    kind: 'usage' | 'recurring' | 'oneOff' | 'adjustment';
    ratedAt: string;
    source: string;
    rate?: string;
    quantity?: string;
    meter?: string;
    usageEvent?: string;
    adjustment?: string;
    adjustmentFor?: string;
}
/** Exact fixed-rate snapshots. Tax/proration are explicit domain-priced adjustments. */
export declare class Billing {
    private readonly engine;
    private readonly settlementAdmission?;
    constructor(engine: Engine, settlementAdmission?: SettlementAdmission | undefined);
    private call;
    private period;
    private calculate;
    rate(input: ChargeInput, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    private snapshot;
    draft(input: {
        key: string;
        period: string;
        charges: readonly string[];
        reason: string;
        corrects?: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    issue(bill: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    inspect(bill: string, ctx: CallContext): Effect.Effect<{
        charges: Wire[];
        totals: Record<string, string>;
        digest: string;
        bill: any;
        issue: Wire | null;
    }, ForgeError, never>;
    positions(bill: string, asOf: string, ctx: CallContext): Effect.Effect<Wire[], ForgeError, never>;
}
