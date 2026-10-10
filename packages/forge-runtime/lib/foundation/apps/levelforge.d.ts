import type { Engine, CallContext } from "../../engine.js";
/** Structural subset of LevelForge's actual ArtifactProductionJobStore port.
 * The caller retains its full job shape; Foundation never stores its opaque payload. */
export interface ProductionJob {
    jobId: string;
    revision: number;
    graph: {
        graphId: string;
    };
    status: string;
    provenance: {
        sourceRevision?: string;
    };
    executors: {
        id: string;
        version: string;
    }[];
    events: {
        type: string;
        at: string;
    }[];
}
export interface ProductionStore<J extends ProductionJob> {
    create(job: J): Promise<J>;
    load(jobId: string): Promise<J | undefined>;
    save(job: J, expectedRevision: number): Promise<J>;
    list(): Promise<J[]>;
}
/** Opt-in decoration at the real recipe runtime's awaited persistence seam.
 * Load reconciles a durable app write whose Foundation mirror was interrupted. */
export declare function withFoundationProduction<J extends ProductionJob>(store: ProductionStore<J>, engine: Engine, binding: {
    projectId: string;
    definition: string;
    evaluationSet: string;
    executor: string;
}, ctx: CallContext): ProductionStore<J>;
