import { Effect } from "effect";
import type { Engine, CallContext, AtomicMutation } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
export type AllocationAction = "reserve" | "allocate" | "release" | "cancel" | "expire" | "book" | "replace";
type Action = AllocationAction;
export interface AllocationCommand {
    reservation: string;
    action: AllocationAction;
    commandKey: string;
    replacement?: string;
}
type Phase = "reserved" | "allocated" | "released" | "cancelled" | "expired";
/** All authority is obtained through this validated projection, not raw candidate
 * resources. Unique(pool,ordinal) atomically commits the guard and transition. */
export declare class Allocations {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private read;
    /** Prepare one guarded state transition per distinct pool against durable candidates.
     * Commit all returned descriptors plus the owning application's publication via
     * Engine.atomic. A UniqueConflict means reread/reprepare the entire group. */
    prepare(commands: readonly AllocationCommand[], ctx: CallContext): Effect.Effect<{
        mutations: AtomicMutation[];
        existing: Wire[];
    }, ForgeError>;
    /** Validated current lifecycle of a durable candidate, with the journal guard. */
    reservation(reservation: string, ctx: CallContext): Effect.Effect<{
        row: any;
        phase: Phase | null;
        head: {} | null;
        history: Wire[];
    }, ForgeError, never>;
    act(reservation: string, action: Action, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    inspect(pool: string, at: string, ctx: CallContext): Effect.Effect<{
        pool: string;
        unit: string;
        available: string;
        head: {} | null;
        claims: {
            reservation: string;
            phase: Phase;
        }[];
    }, ForgeError, never>;
}
export {};
