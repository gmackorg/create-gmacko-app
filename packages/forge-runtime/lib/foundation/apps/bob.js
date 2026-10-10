import { Fulfillments } from '../fulfillment.js';
import { checkLength, decodeDatetime, decodeText } from '../../codecs.js';
/** This certifies recorded execution completion, not reviewed or merged delivery.
 * A trusted binding must identify an already started Foundation Fulfillment.
 * Supply session/planning identities when the composition root knows them; the
 * minimal binding retains compatibility with callers validating native rows.
 */
export function bobCompletion(engine, ctx, binding, run) {
    return { async recordCompletion(input) {
            // Snapshot before the first asynchronous write so both steps use the same
            // authorized observation, even if the caller reuses mutable input objects.
            const fact = { ...input }, context = { ...ctx }, trusted = { ...binding };
            for (const key of ['taskRunId', 'sessionId', 'userId', 'workspaceId', 'planningItemId']) {
                checkLength(decodeText(fact[key]), 1, 128);
                if (trusted[key] !== undefined && fact[key] !== trusted[key])
                    throw new Error('Run identity does not match authorized binding');
            }
            decodeDatetime(fact.completedAt);
            if (fact.workspaceId !== context.tenant || fact.userId !== context.actor || fact.taskRunId !== trusted.taskRunId)
                throw new Error('Run identity does not match authorized binding');
            const terminal = await run(new Fulfillments(engine).finish(trusted.fulfillmentId, 'completed', 'complete', fact.completedAt, 'Bob persisted task run completed', { ...context, idempotencyKey: JSON.stringify(['bob-completion', fact.taskRunId]) }));
            const link = await run(engine.call('@foundation-app/bob/_/RunCompletion.create', {
                taskRunId: fact.taskRunId, sessionId: fact.sessionId, userId: fact.userId, workspaceId: fact.workspaceId,
                planningItemId: fact.planningItemId, execution: trusted.fulfillmentId, terminal: terminal.id,
            }, { ...context, idempotencyKey: JSON.stringify(['bob-run', fact.taskRunId]) }));
            return { fulfillmentEndId: String(terminal.id), runLinkId: String(link.id) };
        } };
}
