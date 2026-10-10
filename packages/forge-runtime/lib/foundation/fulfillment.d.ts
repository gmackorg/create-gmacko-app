import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import type { WorkQueue, TaskRequirements } from "../work-queues.js";
export declare class Fulfillments {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    status(fulfillment: string, ctx: CallContext): Effect.Effect<{
        phase: string;
        coverage: string;
        end: Wire;
    } | {
        phase: string;
        coverage: string;
        end: null;
    }, import("../errors.js").ForgeError, never>;
    start(fulfillment: string, beganAt: string, ctx: CallContext): Effect.Effect<any, import("../errors.js").ForgeError, never>;
    finish(fulfillment: string, outcome: "completed" | "failed" | "cancelled", coverage: "complete" | "partial" | "none", endedAt: string, reason: string, ctx: CallContext, evidence?: string | null): Effect.Effect<any, import("../errors.js").ForgeError, never>;
    /** Queue calls run only after an authorized durable business link is accepted.
     * This is a resumable two-step bridge; queue success is not business success. */
    enqueueTask<Input extends {
        fulfillment: string;
    }>(queue: WorkQueue, task: string, input: Input, requirements: TaskRequirements, ctx: CallContext): Effect.Effect<import("../work-queues.js").QueueTask, import("../errors.js").ForgeError, never>;
}
