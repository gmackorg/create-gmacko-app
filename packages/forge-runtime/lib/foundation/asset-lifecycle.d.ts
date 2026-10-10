import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export type AssetAction = 'acquire' | 'provision' | 'commission' | 'operate' | 'deactivate' | 'move' | 'refurbish' | 'retire' | 'decommission';
export type AssetPhase = 'unprovisioned' | 'acquired' | 'commissioned' | 'operational' | 'inactive' | 'retired' | 'decommissioned';
export interface AssetState {
    row: Wire;
    events: Wire[];
    phase: AssetPhase;
    head: string | null;
    place: string | null;
    custody: string | null;
    configuration: string | null;
}
export declare class Assets {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private validate;
    state(asset: string, ctx: CallContext): Effect.Effect<AssetState, ForgeError>;
    act(input: {
        asset: string;
        previous: string | null;
        action: AssetAction;
        at: string;
        place?: string;
        custody?: string;
        configuration: string;
        evidence: string;
        attestation?: string;
        reason: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
}
