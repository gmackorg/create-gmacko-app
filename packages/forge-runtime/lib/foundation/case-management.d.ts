import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export type CaseAction = 'file' | 'interaction' | 'decision' | 'work' | 'milestone' | 'transfer' | 'relate' | 'escalate' | 'close' | 'reopen';
export interface CaseState {
    row: Wire;
    events: Wire[];
    closed: boolean;
    owner: string;
    head: string | null;
}
export declare class Cases {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private support;
    private detail;
    state(id: string, ctx: CallContext): Effect.Effect<CaseState, ForgeError>;
    act(input: {
        case: string;
        previous: string | null;
        kind: CaseAction;
        at: string;
        reason: string;
        fact?: string;
        owner?: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
}
