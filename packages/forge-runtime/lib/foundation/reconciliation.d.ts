import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export declare class Reconciliations {
    private readonly engine;
    constructor(engine: Engine);
    private attempt;
    /** Prior journal events remain history; only the selected current attempt confers authority. */
    private currentEvent;
    /** Read complete serialized history; hidden journal entries never imply end. */
    state(scope: string, ctx: CallContext): Effect.Effect<{
        events: Wire[];
        latest: Wire | null;
    }, ForgeError>;
    publish(scope: string, desired: string, kind: 'Desired' | 'Attempt' | 'Result', expectedPrevious: string | null, ctx: CallContext, attempt?: string, result?: string): Effect.Effect<Wire, ForgeError>;
    recordResult(attempt: string, outcome: 'Converged' | 'Failed' | 'Uncertain', support: string, detail: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** Must be called again immediately before a provider operation. A local fence
     * cannot undo an external side effect; providers require their own revision fence. */
    assertCurrent(scope: string, desired: string, expectedEvent: string, ctx: CallContext): Effect.Effect<void, ForgeError>;
}
