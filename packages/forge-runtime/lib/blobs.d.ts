/**
 * Blob upload lifecycle (plan §13). Metadata lives in the resource record
 * (server-owned fields); bytes live in the object store under private keys.
 * Only sealed objects are ever served.
 */
import { Effect } from "effect";
import type { Wire } from "./decode.js";
import type { CallContext, Engine } from "./engine.js";
import { type ForgeError } from "./errors.js";
import type { Resource } from "./model.js";
import { type RuntimeServices } from "./services.js";
export declare class Blobs {
    private readonly engine;
    constructor(engine: Engine);
    private stagingKey;
    private sealedKey;
    /** A metadata mutation on the blob record, through the normal commit path (version guard, audit, outbox). */
    private mutate;
    beginUpload(r: Resource, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    finalizeUpload(r: Resource, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
    download(r: Resource, body: Wire, ctx: CallContext): Effect.Effect<Wire, ForgeError, RuntimeServices>;
}
