import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export interface ObservationInput {
    key: string;
    metric: string;
    subject: string;
    value: string;
    unit: string;
    observedAt?: string;
    from?: string;
    until?: string;
    source: string;
    sourceRecord: string;
    support?: string;
}
/** Durable business measurements; telemetry ingestion is a separate authorized producer. */
export declare class Measurements {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private read;
    private calculate;
    observation(id: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    record(input: ObservationInput, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    derive(input: Omit<ObservationInput, 'value'> & {
        operation: 'sum' | 'mean' | 'ratio' | 'product';
        left: string;
        right: string;
    }, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    assessment(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        objective: any;
        observation: Wire;
        actual: string;
        expected: string;
        variance: string;
        status: "breached" | "met";
    }, ForgeError, never>;
    breach(id: string, ctx: CallContext): Effect.Effect<{
        event: any;
        assessment: {
            row: any;
            objective: any;
            observation: Wire;
            actual: string;
            expected: string;
            variance: string;
            status: "breached" | "met";
        };
    }, ForgeError, never>;
    effect(id: string, ctx: CallContext): Effect.Effect<{
        effect: any;
        breach: {
            event: any;
            assessment: {
                row: any;
                objective: any;
                observation: Wire;
                actual: string;
                expected: string;
                variance: string;
                status: "breached" | "met";
            };
        };
        fulfillment: any;
    }, ForgeError, never>;
}
