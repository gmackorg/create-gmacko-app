import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export interface LineageTraversal {
    nodes: Wire[];
    relations: Wire[];
    transformations: Wire[];
}
/** Traversal returns explicit hyperedge memberships, never inferred pairwise edges. */
export declare class Lineage {
    private readonly engine;
    constructor(engine: Engine);
    member(kind: 'Input' | 'Output', transformation: string, node: string, next: string | null, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private chain;
    seal(transformation: string, inputs: string, outputs: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** Enumerate the complete bounded candidate index, then authorize every record.
     * A filtered public list cannot prove that hidden provenance links are absent. */
    private completeIndex;
    traverse(node: string, direction: 'ancestors' | 'descendants', ctx: CallContext, budget?: number): Effect.Effect<LineageTraversal, ForgeError>;
}
