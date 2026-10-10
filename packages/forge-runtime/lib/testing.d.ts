/** Deterministic service implementations for tests and the in-memory target. */
import { Layer } from "effect";
import { Clock, CursorSecret, IdGen, Objects, Storage, type ObjectStoreAdapter, type StorageAdapter } from "./services.js";
export declare function jumpTestClock(layer: object, ms: number): void;
export declare function testLayer(storage: StorageAdapter, opts?: {
    start?: string;
    secret?: string;
    runId?: string;
    objects?: ObjectStoreAdapter;
    idPrefix?: string;
}): Layer.Layer<Clock | IdGen | Storage | CursorSecret | Objects, never, never>;
