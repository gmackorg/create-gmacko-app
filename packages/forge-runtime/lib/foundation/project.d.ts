import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
interface WorkProgress {
    row: Wire;
    phase: string;
    complete: boolean;
    start: string | null;
    end: string | null;
    actual: string | null;
    variance: string | null;
    usageEvents: string[];
    allocation: unknown;
    appointment: unknown;
}
export declare class Projects {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private members;
    progress(project: string, through: string, ctx: CallContext): Effect.Effect<{
        row: any;
        program: any;
        goal: any;
        forecast: any;
        budget: import("./planning-budget.js").BudgetState | null;
        work: WorkProgress[];
        dependencies: {
            edge: Wire;
            planSatisfied: boolean;
            ready: boolean;
            violated: boolean;
        }[];
        plannedLeafCount: number;
        completedLeafCount: number;
        plannedDueLeafCount: number;
        overdue: string[];
        through: string;
    }, ForgeError, never>;
    milestone(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        work: any;
        milestone: any;
        evaluation: Wire;
    }, ForgeError, never>;
}
export {};
