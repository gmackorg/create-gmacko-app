/**
 * Effective dating and hierarchy (plan §18), as engine extensions. The engine
 * computes the guards during planning; every adapter re-checks them at commit
 * (D1: predicate in the assertion batch; DynamoDB: per-group revision guard).
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import type { CallContext, Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import type { Resource } from "./model.js";
import { type CommitPlan, type IntervalGuard, type RuntimeServices, type StoredRecord, type TreeGuard } from "./services.js";
export declare const MAX_DEPTH = 32;
export declare const TRAVERSAL_LIMIT = 100;
export declare class Temporal {
    private readonly engine;
    constructor(engine: Engine);
    /** Validate the interval of a candidate record and produce its overlap guard. */
    intervalGuard(r: Resource, after: Wire, id: string): Effect.Effect<IntervalGuard | undefined, ForgeError>;
    /** Pre-check for a precise error; the adapter re-checks atomically. */
    checkOverlap(r: Resource, guard: IntervalGuard | undefined, ctx: CallContext): Effect.Effect<void, ForgeError, RuntimeServices>;
    /** `effective(group, at)` → zero-or-one. */
    effective(r: Resource, query: string, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    /** Walk parents from `startId`; fail on cycles or excessive depth. Returns the ancestor ids, nearest first. */
    ancestorsOf(r: Resource, startId: string, ctx: CallContext): Effect.Effect<StoredRecord[], ForgeError, RuntimeServices>;
    /** Produce the tree guard for a create/move that sets `parent`. */
    treeGuard(r: Resource, id: string, parentId: string | null, ctx: CallContext): Effect.Effect<TreeGuard | undefined, ForgeError, RuntimeServices>;
    move(r: Resource, body: Wire, ctx: CallContext): Effect.Effect<CommitPlan, ForgeError, RuntimeServices>;
    children(r: Resource, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    ancestors(r: Resource, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
}
