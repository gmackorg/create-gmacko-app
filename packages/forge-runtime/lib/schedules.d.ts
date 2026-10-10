/**
 * Schedules (plan §19). A `source` with `cron` compiles to a canonical
 * recurrence IR; providers never receive the raw string. Both hosts deliver
 * ticks (Cloudflare Cron Trigger, EventBridge rule) and this module decides
 * which *intended* occurrences are due, so occurrence identity is
 * (schedule, intended instant), never the observed delivery time.
 *
 * Semantics fixed here (the two providers disagree on several):
 * - weekday numbering: 0 and 7 are Sunday;
 * - day-of-month and day-of-week both restricted: OR (Vixie cron);
 * - local-time schedules: a nonexistent local time (DST gap) is skipped, a
 *   repeated local time (DST overlap) fires once, at its first instant;
 * - missed occurrences are caught up oldest-first, bounded by a window;
 * - overlap policy `skip`: an occurrence due while its predecessor is still
 *   running is recorded as skipped, never queued.
 */
import { Effect } from "effect";
import type { Engine } from "./engine.js";
import type { SourceDecl } from "./model.js";
export type FieldSet = number[] | "any";
export interface Recurrence {
    kind: "cron";
    minutes: number[];
    hours: number[];
    daysOfMonth: FieldSet;
    months: FieldSet;
    daysOfWeek: FieldSet;
    /** How restricted day-of-month and day-of-week combine (both restricted). */
    dayCombination: "or";
    timezone: string;
}
export declare function parseRecurrence(cron: string, timezone?: string): Recurrence;
/** First occurrence strictly after `after` (ISO), as canonical UTC. */
export declare function nextOccurrence(r: Recurrence, after: string): string | null;
/** Occurrences in (from, to], oldest first, bounded. */
export declare function occurrencesBetween(r: Recurrence, from: string, to: string, limit?: number): string[];
export interface SchedulePolicy {
    /** How far back a tick catches up missed occurrences (ms). Older ones are recorded as skipped. */
    catchUpWindowMs: number;
    overlap: "skip" | "allow";
}
export declare const DEFAULT_POLICY: SchedulePolicy;
export interface TickResult {
    source: string;
    occurrence: string;
    outcome: "ran" | "duplicate" | "skipped-overlap" | "failed";
    error?: string;
}
export declare class Schedules {
    private readonly engine;
    private readonly recurrences;
    policy: SchedulePolicy;
    constructor(engine: Engine);
    recurrence(s: SourceDecl): Recurrence;
    /** A provider tick at `now`: run every intended occurrence that is due and not yet recorded. */
    tick(tenant: string, now: string): Effect.Effect<TickResult[], never, never>;
    status(tenant: string): Effect.Effect<{
        source: string;
        lastOccurrence: string | null;
        next: string | null;
        skipped: string[];
    }[], never, never>;
    /** Release the running claim; other ticks may have recorded skips meanwhile, so reload and merge. */
    private complete;
    private save;
}
