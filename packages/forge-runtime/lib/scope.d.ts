/**
 * Purpose scoping at runtime (plan §8.4–8.5, M12). The compiled
 * `capabilities/1` plan is the static ceiling: a call under a purpose on a
 * `@purposeScoped` resource is checked *before* execution (filter/order
 * params, patch fields, named actions) and its result is rebuilt as a new
 * object holding only the surface's read fields (a cast never removes keys).
 * Runtime restrictions only intersect this ceiling (D09); several purposes in
 * one invocation are refused rather than unioned (PAR-102). Each (resource,
 * purpose) reader is a distinct Effect service key (PAR-103).
 */
import { Context, Effect } from "effect";
import type { Wire } from "./decode.js";
import type { CallContext, Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import type { Resource } from "./model.js";
export interface SurfaceAtom {
    verb: string;
    name: string;
    origin: string[];
}
export interface Surface {
    resource: string;
    purpose: string;
    capabilities: string[];
    allowAtoms: SurfaceAtom[];
    deny: SurfaceAtom[];
    digest: string;
}
export interface CapabilitiesPlan {
    version: string;
    surfaces: Surface[];
}
export declare class Scope {
    private readonly engine;
    constructor(engine: Engine);
    private plan;
    private strict;
    private scoped;
    /** Surface for (resource, purpose): `null` when the purpose has no binding on the resource. */
    surface(resourceId: string, purpose: string): Surface | null;
    permits(s: Surface, verb: string, name: string): boolean;
    /**
     * Resolve the surface a call runs under, or `null` when scoping does not apply
     * (resource not purpose-scoped, or a privileged maintenance context). Fails when
     * a scoped resource is used without a usable purpose.
     */
    resolve(r: Resource, ctx: CallContext): Effect.Effect<Surface | null, ForgeError>;
    /** Query authority is separate from read authority: every partition and order key must be granted. */
    checkQuery(s: Surface, r: Resource, params: Record<string, unknown>, order: string[]): Effect.Effect<void, ForgeError>;
    checkPatch(s: Surface, r: Resource, patch: Record<string, unknown>): Effect.Effect<void, ForgeError>;
    checkCreate(s: Surface, r: Resource, input: Record<string, unknown>): Effect.Effect<void, ForgeError>;
    checkAction(s: Surface, r: Resource, action: string): Effect.Effect<void, ForgeError>;
    /**
     * A new object with only the granted read fields — never the stored object narrowed by a cast. A surface that
     * grants any write (update or action) also exposes `version`: optimistic concurrency needs the token, and the
     * token discloses nothing but the revision count.
     */
    project(s: Surface, record: Wire): Wire;
    projectPage(s: Surface, page: Wire): Wire;
}
export interface ScopedReaderShape {
    get(id: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    list(query: string, params: Wire, ctx: CallContext, page?: {
        cursor?: string;
        limit?: number;
    }): Effect.Effect<Wire, ForgeError>;
}
export interface ScopedReader {
    key: string;
    surface: Surface;
    /** A distinct Effect service per (resource, purpose): providing another reader's service does not satisfy it. */
    service: Context.Service<ScopedReaderShape, ScopedReaderShape>;
    reader: ScopedReaderShape;
}
export declare function scopedReader(engine: Engine, resourceId: string, purpose: string): ScopedReader;
