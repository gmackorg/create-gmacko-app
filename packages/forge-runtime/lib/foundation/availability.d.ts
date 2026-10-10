import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
export declare const AVAILABILITY_LIMITS: Readonly<{
    rules: 128;
    queryMinutes: number;
}>;
export interface LocalWindow {
    startMinute: number;
    endMinute: number;
}
/** Sunday = 0. endMinute < startMinute carries into the next local day. */
export interface WeeklyWindow extends LocalWindow {
    weekday: number;
}
/** Replaces all weekly availability on this civil date; [] closes the whole date. */
export interface DateException {
    date: string;
    windows: readonly LocalWindow[];
}
/** Absolute half-open interval. Highest priority wins; tied overlapping priorities are rejected. */
export interface AvailabilityOverride {
    from: string;
    until: string;
    available: boolean;
    priority: number;
}
export interface CalendarRevisionInput {
    calendar: string;
    timezone: string;
    weekly: readonly WeeklyWindow[];
    exceptions?: readonly DateException[];
    overrides?: readonly AvailabilityOverride[];
    origin?: string;
}
export interface AvailabilityWindow {
    from: string;
    until: string;
}
export interface EffectiveAvailability {
    revision: string;
    timezone: string;
    timezoneDataVersion: string;
    windows: AvailabilityWindow[];
}
/** Pinned revision queries use the host's versioned Intl timezone database. Hosts without
 * a discoverable tzdb version must supply a truthful deployment-controlled version label.
 * Version mismatches fail closed; replay on another tzdb requires the matching host image. */
export declare class Availability {
    private readonly engine;
    private readonly timezoneDataVersion;
    constructor(engine: Engine, options?: {
        timezoneDataVersion?: string;
    });
    private call;
    createCalendar(label: string, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    /** Publish the immutable revision last. Failed staging can leave orphan rows, never a partial revision.
     * The pinned count + unique ordinals mean later appends cannot change this revision's rule set. */
    createRevision(input: CalendarRevisionInput, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    effectiveWindows(revision: string, from: string, until: string, ctx: CallContext): Effect.Effect<EffectiveAvailability, ForgeError>;
}
