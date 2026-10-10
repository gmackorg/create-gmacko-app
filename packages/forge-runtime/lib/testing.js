/** Deterministic service implementations for tests and the in-memory target. */
import { Layer } from "effect";
import { MemoryObjectStore } from "./adapters/memory-objects.js";
import { Clock, CursorSecret, IdGen, Objects, Storage } from "./services.js";
/** Test clocks belong to a layer, shared only by engines using that exact layer.
 * Weak keys avoid retaining fixtures after their engines have been discarded. */
const testClocks = new WeakMap();
export function jumpTestClock(layer, ms) {
    testClocks.get(layer)?.jump(ms);
}
export function testLayer(storage, opts = {}) {
    let t = Date.parse(opts.start ?? "2026-01-01T00:00:00.000Z");
    const counters = new Map();
    let ops = 0;
    // Operation ids seed provider idempotency tokens; against shared live stores they must not repeat across runs.
    const runId = opts.runId ?? "";
    const clock = Layer.succeed(Clock)({ now: () => new Date((t += 1000) - 1000).toISOString() });
    const ids = Layer.succeed(IdGen)({
        next: (r) => {
            const prefix = r.name.slice(0, 3).toLowerCase();
            const n = (counters.get(prefix) ?? 0) + 1;
            counters.set(prefix, n);
            return `${opts.idPrefix ?? ""}${prefix}_${String(n).padStart(4, "0")}`;
        },
        opId: () => `${runId}op_${String(++ops).padStart(6, "0")}`,
    });
    const layer = Layer.mergeAll(clock, ids, Layer.succeed(Storage)(storage), Layer.succeed(CursorSecret)({ key: opts.secret ?? "test-secret" }), Layer.succeed(Objects)(opts.objects ?? new MemoryObjectStore()));
    testClocks.set(layer, { jump: ms => void (t += ms) });
    return layer;
}
