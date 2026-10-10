import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import { type ForgeError } from '../errors.js';
export interface CapacityProjection {
    capacity: string;
    basis: string;
    unit: string;
    at: string;
    amount: string;
    available: string;
    committed: string;
    remaining: string;
    demanded: string;
    unapplied: string;
    gap: string;
    qualified: boolean;
    temporallyAvailable: boolean;
    allocationHead: unknown;
}
/** Business capacity projections. Allocation alone arbitrates reservation ownership. */
export declare class Capacities {
    private readonly engine;
    constructor(engine: Engine);
    project(capacity: string, at: string, ctx: CallContext): Effect.Effect<CapacityProjection, ForgeError>;
    compare(planned: string, actual: string, at: string, ctx: CallContext): Effect.Effect<{
        expected: CapacityProjection;
        observed: CapacityProjection;
        variance: string;
    }, ForgeError, never>;
}
