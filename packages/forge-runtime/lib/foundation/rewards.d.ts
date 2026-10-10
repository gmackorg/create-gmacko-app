import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Rewards {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private read;
    private support;
    private transfer;
    private award;
    private terminal;
    state(id: string, instant: string, ctx: CallContext): Effect.Effect<{
        end: Wire | null;
        available: boolean;
        row: Wire;
        member: Wire;
        program: Wire;
        reversed: boolean;
    }, ForgeError, never>;
    end(input: {
        award: string;
        kind: 'redeemed' | 'expired' | 'reversed';
        at: string;
        reason: string;
        redemption?: string;
        posting?: string;
        benefitEnd?: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
}
