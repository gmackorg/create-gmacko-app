import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import { type ForgeError } from "../errors.js";
import type { Wire } from "../decode.js";
export interface SchedulingNeedInput {
    pool: string;
    calendar: string;
    quantity: string;
    participant?: string;
}
export interface SchedulingRequirementInput {
    key: string;
    durationMinutes: number;
    participants: string;
    place: string;
    needs: SchedulingNeedInput[];
}
export interface BookingInput {
    key: string;
    slot: string;
    fulfillment: string;
    predecessor?: string;
}
/** Scheduling owns bounded slot selection and appointment publication; Allocation
 * owns capacity and Availability owns recurrence. Staging is inert, publication
 * and every involved pool guard commit together using Engine.atomic. */
export declare class Scheduling {
    private readonly engine;
    private readonly availability;
    private readonly allocation;
    constructor(engine: Engine);
    private call;
    private clean;
    requirement(input: SchedulingRequirementInput, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private needs;
    private membership;
    search(requirement: string, from: string, until: string, ctx: CallContext): Effect.Effect<{
        from: string;
        until: string;
    }[], ForgeError>;
    slot(requirement: string, from: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private slotNeeds;
    private members;
    inspect(appointment: string, ctx: CallContext): Effect.Effect<{
        appointment: Wire;
        commit: Wire | null;
        end: Wire | null;
        reservations: Wire[];
    }, ForgeError>;
    book(input: BookingInput, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    cancel(appointment: string, reason: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
