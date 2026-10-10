export interface ExecutionManifest {
    version: "execution-manifest/1";
    id: string;
    kind: "implementation" | "provider";
    requires: string[];
}
export interface PinnedExecutionManifest {
    digest: string;
    manifest: ExecutionManifest;
}
/** Structural subset of compiled workflow IR needed for activity selection. */
export interface ExecutionWorkflowStep {
    kind: string;
    id?: string;
    target?: {
        kind: string;
        function?: string;
    };
    call?: ExecutionWorkflowStep;
    then?: ExecutionWorkflowStep[];
    otherwise?: ExecutionWorkflowStep[];
    branches?: ExecutionWorkflowStep[][];
}
export interface ExecutionArtifact {
    modules: {
        functions: {
            id: string;
            generated?: boolean;
            uses: {
                kind: string;
                function?: string;
                resource?: string;
            }[];
        }[];
        resources: {
            id: string;
        }[];
        workflows?: {
            id: string;
            version: number;
            graphHash: string;
            steps: ExecutionWorkflowStep[];
        }[];
    }[];
}
export interface ExecutionProfile {
    id: string;
    /** Function/resource identity -> content digest of its selected implementation/provider. */
    bindings: Record<string, string>;
    providers: string[];
}
export interface ExecutionRequirements {
    version: "execution-requirements/1";
    artifactDigest: string;
    operation: string;
    profileDigest: string;
    requirements: string[];
    explanations: Record<string, string[]>;
    provenanceDigest: string;
    workflowStep?: {
        workflow: string;
        step: string;
        version: number;
        graphHash: string;
    };
}
export declare function executionDigest(value: unknown): string;
export declare function pinExecutionManifest(manifest: ExecutionManifest): PinnedExecutionManifest;
export declare function deriveExecutionRequirements(input: {
    artifact: ExecutionArtifact;
    artifactDigest: string;
    operation: string;
    profile: ExecutionProfile;
    manifests: PinnedExecutionManifest[];
    explicit?: {
        atom: string;
        reason: string;
    }[];
}): ExecutionRequirements;
export declare function executionCompatibility(before: ExecutionRequirements, after: ExecutionRequirements): {
    changed: boolean;
    added: string[];
    removed: string[];
    action: string;
};
export declare function runnerEligibility(task: Pick<ExecutionRequirements, "requirements" | "explanations">, capabilities: string[]): {
    eligible: boolean;
    missing: string[];
    explanations: Record<string, string[]>;
};
/** Select a function activity from a pinned workflow without evaluating its branches.
 * The caller identifies the step actually being dispatched. Map item identities remain
 * the workflow driver's concern; every item shares this immutable execution contract. */
export declare function deriveWorkflowStepRequirements(input: Omit<Parameters<typeof deriveExecutionRequirements>[0], "operation"> & {
    workflow: string;
    step: string;
}): ExecutionRequirements;
