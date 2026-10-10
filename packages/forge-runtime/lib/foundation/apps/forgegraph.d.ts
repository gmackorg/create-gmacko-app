import type { Engine, CallContext } from "../../engine.js";
export interface CheckEvent {
    v: 2;
    phase: "typecheck" | "lint" | "test" | "e2e" | "build" | "all";
    event: "run_started" | "test_started" | "test_finished" | "output" | "run_finished" | "skipped";
    at: string;
    stream?: string;
    status?: "running" | "passed" | "failed" | "skipped";
    exitCode?: number;
    confidence?: "exact" | "scraped";
    test?: {
        name: string;
        status: "passed" | "failed" | "skipped" | "pending" | "other";
        duration: number;
    };
}
export interface EligibilityInput {
    changeset: {
        id: string;
        parentChangesetId: string | null;
        status: string;
    };
    policy: {
        autoMerge: boolean;
        requiredChecks: string[] | null;
    };
    checks: Record<string, "pending" | "passed" | "failed">;
    parentStatus?: string;
}
export interface ForgeGraphFunctions {
    summarizeChecks(events: CheckEvent[]): {
        status: "passed" | "failed";
        phases: {
            phase: string;
            status: string;
            confidence?: string;
        }[];
    };
    isEligibleForAutoMerge(input: EligibilityInput): Promise<{
        eligible: boolean;
        reason?: string;
    }>;
}
export interface AssessmentInput {
    repositoryId: string;
    changesetId: string;
    buildId: string;
    headSHA: string;
    definition: string;
    evaluationSet: string;
    executor: string;
    changeset: EligibilityInput["changeset"];
    policy: EligibilityInput["policy"];
    parentStatus?: string;
    events: CheckEvent[];
}
/** Assesses existing CI observations. This new run is not the original CI execution.
 * The real ForgeGraph folds and eligibility function are injected by its caller. */
export declare function assessChangeset(engine: Engine, source: ForgeGraphFunctions, input: AssessmentInput, ctx: CallContext, currentHead: () => Promise<string>, now: () => string): Promise<{
    eligible: boolean;
    reason: string;
    assessment: string;
}>;
