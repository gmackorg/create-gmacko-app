import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
/** Resolves exact historical meaning. Never follows a replacement implicitly. */
export declare class CodedDomains {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private support;
    inspect(revision: string, at: string, ctx: CallContext): Effect.Effect<{
        state: "active" | "retired" | "superseded" | "inactive" | "withdrawn";
        replacement: string | null;
        code: any;
        meaning: any;
        domain: any;
        release: any;
    }, ForgeError, never>;
    inspectMapping(revision: string, at: string, ctx: CallContext): Effect.Effect<{
        active: boolean;
        relation: any;
        meaning: any;
        code: {
            state: "active" | "retired" | "superseded" | "inactive" | "withdrawn";
            replacement: string | null;
            code: any;
            meaning: any;
            domain: any;
            release: any;
        };
        mapping: any;
        revision: any;
    }, ForgeError, never>;
}
