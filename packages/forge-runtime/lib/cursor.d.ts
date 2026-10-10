/** Opaque, integrity-protected pagination cursors (specs/portable-profile/wire-format.md). */
import { Effect } from "effect";
import { type ForgeError } from "./errors.js";
export interface CursorState {
    q: string;
    v: number;
    t: string;
    k: string[];
    r: unknown[];
    id: string;
}
export declare function encodeCursor(secret: string, state: CursorState): Effect.Effect<string, never>;
export declare function decodeCursor(secret: string, cursor: string, expect: {
    q: string;
    t: string;
}): Effect.Effect<CursorState, ForgeError>;
