/**
 * Views (§17), projections (§17) and caches (§16). All three are built on the
 * primitives every adapter already provides: bounded list queries and opaque
 * documents with optimistic versions, so no adapter grows a new storage shape.
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import type { Envelope, Transport } from "./dispatch.js";
import type { CallContext, Engine } from "./engine.js";
import { ForgeError } from "./errors.js";
import type { CacheDecl, ProjectionDecl, ViewDecl } from "./model.js";
import { type RuntimeServices } from "./services.js";
/**
 * Route `projection:*` subscriptions to the in-process projection applier and everything
 * else to the host's queue transport, so projections ride the same durable outbox.
 */
export declare function withProjections(engine: Engine, fallback: Transport): Transport;
/** Every in-process consumer's subscriptions (projections and workflow waits) merged over the host's. */
export declare function internalSubscriptions(engine: Engine, base?: Record<string, string[]>): Record<string, string[]>;
export declare class ReadModels {
    private readonly engine;
    constructor(engine: Engine);
    /** Lower the view onto the source's bounded list for its `by` fields, then filter and project fields. */
    view(v: ViewDecl, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    private groupKey;
    private contributes;
    /** Exact contribution of one record: counts as "1", sums as minor-unit integers. */
    private contribution;
    /** Sortable form of a `latest ... by` ordering value: minor units for numbers, ISO text for dates. */
    private orderKey;
    private orderNumeric;
    private adjust;
    private meta;
    private render;
    status(p: ProjectionDecl, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    get(p: ProjectionDecl, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    /**
     * Apply one source change event. The contribution ledger is keyed by source id
     * and carries the record revision, so replays and out-of-order deliveries are
     * ignored and a moved or filtered-out record is subtracted before being re-added.
     */
    applyEvent(p: ProjectionDecl, env: Envelope): Effect.Effect<"applied" | "stale" | "ignored", ForgeError, RuntimeServices>;
    private applyEventOnce;
    /** Rebuild into a fresh generation from the source's bounded default list, then switch the active pointer. */
    rebuild(p: ProjectionDecl, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    /** In-process single-flight: concurrent misses for one key share a loader run (a local optimisation, not a global lock). */
    private readonly inflight;
    read(c: CacheDecl, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    private load;
    /** Loader `Resource.effective(key..., now)` lowers to the resource's effective query and yields the next boundary. */
    private runLoader;
    /** `freshUntil` is a duration, `nextEffectiveBoundary`, or `min(...)` of those; an unknown boundary contributes nothing. */
    private freshness;
}
export declare function durationMs(d: string): number;
