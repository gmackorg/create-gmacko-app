/**
 * CSV import (plan §13). A file becomes a changeset proposal through a
 * mapping profile: every row is a normal create/update operation, so preview,
 * approval, atomic/resumable commit and per-row results are the changeset's.
 * Import-profile decoding (empty cell = absent, trimming) happens here; the
 * strict API codecs still run on every row.
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import type { CallContext, Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import { type RuntimeServices } from "./services.js";
export interface RowError {
    line: number;
    code: string;
    path?: string;
    message: string;
}
export declare class Imports {
    private readonly engine;
    constructor(engine: Engine);
    handle(action: string, body: Wire, ctx: CallContext): Effect.Effect<any, ForgeError, RuntimeServices>;
    private resource;
    private bytes;
    private writable;
    /** Header -> field suggestion: exact, then case-insensitive, then snake/kebab-insensitive. */
    private suggest;
    private inspect;
    private stage;
    /** Import-profile coercion for typed columns; strict API codecs still validate the result. */
    private coerce;
    /** Apply the field's declared normalizers so in-file uniqueness matches the engine's claims. */
    private canonicalKeyPart;
}
