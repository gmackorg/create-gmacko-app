import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export interface DemandInput {
    key: string;
    requester: string;
    specification: string;
    constraints: string;
    origin: 'explicit' | 'inferred';
    quantity: string;
    unit: string;
    place?: string;
    from: string;
    until: string;
    priority: number;
    priorityPolicy: string;
    source: string;
    support?: string;
}
export declare class Demands {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private dependencies;
    record(input: DemandInput, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    state(demand: string, ctx: CallContext): Effect.Effect<{
        row: any;
        resolution: Wire | null;
        phase: string;
    }, ForgeError, never>;
    resolve(demand: string, outcome: 'cancelled' | 'superseded' | 'converted', target: string | null, at: string, reason: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    /** A group is a view over the original demands, never a new source of quantity. */
    aggregate(group: string, ctx: CallContext): Effect.Effect<{
        group: Wire;
        open: Wire[];
        quantity: string;
        resolved: Wire[];
    }, ForgeError>;
    /** Publish every selected conversion together; cancellation racing any member aborts all. */
    convertGroup(group: string, targets: ReadonlyArray<{
        demand: string;
        fulfillment: string;
    }>, at: string, ctx: CallContext): Effect.Effect<Wire[], ForgeError, never>;
    allocation(link: string, ctx: CallContext): Effect.Effect<{
        demand: {
            row: any;
            resolution: Wire | null;
            phase: string;
        };
        allocation: {
            row: any;
            phase: ("cancelled" | "reserved" | "allocated" | "released" | "expired") | null;
            head: {} | null;
            history: Wire[];
        };
    }, ForgeError, never>;
    schedule(link: string, ctx: CallContext): Effect.Effect<{
        demand: {
            row: any;
            resolution: Wire | null;
            phase: string;
        };
        appointment: {
            appointment: Wire;
            commit: Wire | null;
            end: Wire | null;
            reservations: Wire[];
        };
    }, ForgeError, never>;
    route(link: string, ctx: CallContext): Effect.Effect<{
        demand: {
            row: any;
            resolution: Wire | null;
            phase: string;
        };
        request: any;
    }, ForgeError, never>;
}
