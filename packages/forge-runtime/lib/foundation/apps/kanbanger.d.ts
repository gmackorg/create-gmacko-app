import type { Engine, CallContext } from '../../engine.js';
export interface IssueFact {
    workspaceId: string;
    issueId: string;
    teamId: string;
    creatorId: string;
    createdAt: string;
}
export interface IntakeBinding {
    readonly creatorId: string;
    readonly formId: string;
    readonly submitterId: string;
}
/** Bindings are trusted, tenant-local Foundation IDs; app user IDs are never cast to Party IDs. */
export declare function kanbangerIntake(engine: Engine, ctx: CallContext, binding: IntakeBinding, run: (effect: ReturnType<Engine['call']>) => Promise<Record<string, unknown>>): {
    recordIssue(input: IssueFact): Promise<{
        submissionId: string;
        issueLinkId: string;
    }>;
};
