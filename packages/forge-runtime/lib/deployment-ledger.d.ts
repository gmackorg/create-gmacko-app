import type { StorageAdapter as StructuredStore } from "./services.js";
export declare const DEPLOY_KIND = "_forge/deploy";
export interface PlanStep {
    id: string;
    phase: string;
    kind: string;
    subject?: string;
    blocked?: boolean;
    requiresReview?: boolean;
}
export interface Approval {
    artifact: string;
    signedBy: string;
    signature: string;
}
export interface Lease {
    controller: string;
    token: number;
    until: number;
}
export interface StepState {
    status: "pending" | "running" | "done" | "failed";
    attempts: number;
    result?: unknown;
    checkpoint?: unknown;
    by?: string;
    token?: number;
    error?: string;
}
export interface RolloutDoc {
    rollout: string;
    artifact: string;
    previous?: string;
    approval: Approval;
    steps: Record<string, StepState>;
    order: string[];
    lease: Lease | null;
    fence: number;
    activatedGrants: string[];
    state: "open" | "complete" | "rolled-back";
    _version?: number;
}
export declare class StaleController extends Error {
    constructor(msg: string);
}
export interface StepContext<C = unknown> {
    /** Last checkpoint recorded for this step (by any controller). */
    checkpoint: C | undefined;
    /** Durably record progress; throws StaleController if the lease was lost (the caller must stop). */
    save(checkpoint: C): Promise<void>;
}
export declare class DeploymentLedger {
    private readonly store;
    private readonly scope;
    constructor(store: StructuredStore, scope?: string);
    private load;
    private put;
    /** Open a rollout: the approval must name the artifact being rolled out; blocked plans are refused. */
    open(o: {
        rollout: string;
        artifact: string;
        previous?: string;
        plan: {
            steps: PlanStep[];
            blocked?: boolean;
        };
        approval: Approval;
    }): Promise<RolloutDoc>;
    /** Take the lease when it is free or expired. Returns the fencing token, or null when another controller holds it. */
    acquire(rollout: string, controller: string, leaseMs: number, now?: number): Promise<number | null>;
    renew(rollout: string, controller: string, token: number, leaseMs: number, now?: number): Promise<boolean>;
    private guard;
    /** Run one step under the lease. Done steps return their stored result without running; running steps resume from their checkpoint. */
    run<R, C = unknown>(rollout: string, stepId: string, token: number, action: (ctx: StepContext<C>) => Promise<R>, now?: () => number): Promise<{
        result: R;
        skipped: boolean;
    }>;
    /** Grant activation is recorded once per rollout; a retry after a crash does not activate twice. */
    activateGrantOnce(rollout: string, token: number, grant: string, activate: () => Promise<void>, now?: number): Promise<boolean>;
    /**
     * Roll back to the previous artifact. Rollback re-activates nothing that the revocation authority
     * says is revoked, and never touches erased subjects: current revocations stay authoritative.
     */
    rollback(rollout: string, token: number, o: {
        grants: string[];
        authority: {
            revoked(grant: string): boolean;
        };
        activate: (grant: string) => Promise<void>;
    }, now?: number): Promise<{
        reactivated: string[];
        refused: {
            grant: string;
            reason: string;
        }[];
    }>;
    status(rollout: string): Promise<RolloutDoc>;
    complete(rollout: string, token: number, now?: number): Promise<void>;
}
