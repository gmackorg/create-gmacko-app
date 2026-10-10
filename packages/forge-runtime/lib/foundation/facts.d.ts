import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
/** An unreadable terminal fact must never be interpreted as absent. Probe presence
 * internally, then authorize the actual read through Engine. Append-only rows
 * cannot disappear between these reads through application operations. */
export declare function findTerminalFact(engine: Engine, resourceId: string, field: string, id: unknown, ctx: CallContext): Effect.Effect<Wire | null, ForgeError>;
