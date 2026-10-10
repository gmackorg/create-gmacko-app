import { Intake } from '../intake.js';
import { checkLength, decodeDatetime, decodeText } from '../../codecs.js';
/** Bindings are trusted, tenant-local Foundation IDs; app user IDs are never cast to Party IDs. */
export function kanbangerIntake(engine, ctx, binding, run) {
    return { async recordIssue(input) {
            const fact = { ...input }, context = { ...ctx }, trusted = { ...binding };
            for (const key of ['workspaceId', 'issueId', 'teamId', 'creatorId'])
                checkLength(decodeText(fact[key]), 1, 128);
            decodeDatetime(fact.createdAt);
            if (fact.workspaceId !== context.tenant || fact.creatorId !== trusted.creatorId)
                throw new Error('Issue identity does not match trusted Foundation binding');
            const submission = await run(new Intake(engine).submit({ form: trusted.formId,
                submitter: trusted.submitterId, sourceKey: fact.issueId, submittedAt: fact.createdAt }, { ...context, idempotencyKey: JSON.stringify(['kanbanger-intake', fact.issueId]) }));
            const link = await run(engine.call('@foundation-app/kanbanger/_/IssueSubmission.create', {
                issueId: fact.issueId, teamId: fact.teamId, workspaceId: fact.workspaceId,
                creatorId: fact.creatorId, submission: submission.id,
            }, { ...context, idempotencyKey: JSON.stringify(['kanbanger-issue', fact.issueId]) }));
            return { submissionId: String(submission.id), issueLinkId: String(link.id) };
        } };
}
