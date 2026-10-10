import type { Engine, CallContext } from '../../engine.js';
export interface RunFact {
    taskRunId: string;
    sessionId: string;
    userId: string;
    workspaceId: string;
    planningItemId: string;
    completedAt: string;
}
export interface FulfillmentBinding {
    readonly taskRunId: string;
    readonly fulfillmentId: string;
    /** Optional server-owned identities, checked before either durable write. */
    readonly sessionId?: string;
    readonly planningItemId?: string;
    readonly userId?: string;
    readonly workspaceId?: string;
}
/** This certifies recorded execution completion, not reviewed or merged delivery.
 * A trusted binding must identify an already started Foundation Fulfillment.
 * Supply session/planning identities when the composition root knows them; the
 * minimal binding retains compatibility with callers validating native rows.
 */
export declare function bobCompletion(engine: Engine, ctx: CallContext, binding: FulfillmentBinding, run: (effect: ReturnType<Engine['call']>) => Promise<Record<string, unknown>>): {
    recordCompletion(input: RunFact): Promise<{
        fulfillmentEndId: string;
        runLinkId: string;
    }>;
};
