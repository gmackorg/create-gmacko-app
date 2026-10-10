import type { Engine, CallContext } from "../../engine.js";
export interface LatchFlowRun {
    buildingId: string;
    roomId: string;
    runId: string;
    operatorId: string;
    flowId: string;
    compiledFlowId: string;
    compiledJson: string;
    runnerId: string | null;
    status: "idle" | "running";
    startedAt: string;
}
/** The composition root resolves an exact approved source pin for compiled content.
 * The adapter never interprets a random payload hash as a Git revision. */
export declare function latchFlowFoundation(engine: Engine, options: {
    context(buildingId: string, operatorId: string): CallContext;
    definition(input: {
        buildingId: string;
        flowId: string;
        compiledFlowId: string;
        contentDigest: string;
    }): Promise<string>;
}): {
    recordRun(input: LatchFlowRun): Promise<{
        run: string;
        phase: "Planned" | "Running";
    }>;
};
