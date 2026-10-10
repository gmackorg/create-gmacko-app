import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import type { ForgeError } from '../errors.js';
export type DeliveryOutcome = 'Succeeded' | 'Failed' | 'Uncertain';
/** All writes use authorized Engine operations; provider effects happen only after
 * a durable claim and still require provider-specific deduplication/reconciliation. */
export declare class Deliveries {
    private readonly engine;
    constructor(engine: Engine);
    create(input: {
        key: string;
        destination: string;
        payload?: string;
        maxAttempts: number;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    claim(intent: string, choice: 'Send' | 'Cancel', reason: string, ctx: CallContext, previous?: string): Effect.Effect<Wire, ForgeError>;
    start(step: string, startedAt: string, provider: string, providerKey: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    receipt(input: {
        step: string;
        attempt: string;
        outcome: DeliveryOutcome;
        completedAt: string;
        providerReference: string;
        callbackKey: string;
        detail: string;
        support?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    resolve(receipt: string, outcome: 'Succeeded' | 'Failed', resolvedAt: string, detail: string, ctx: CallContext, support?: string): Effect.Effect<Wire, ForgeError>;
    outcome(step: string, ctx: CallContext): Effect.Effect<string, ForgeError>;
    private support;
}
