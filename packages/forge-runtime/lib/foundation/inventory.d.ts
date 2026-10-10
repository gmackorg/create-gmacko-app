import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export type InventoryAction = 'receipt' | 'issue' | 'transfer' | 'returned' | 'reserve' | 'release' | 'reconcile';
export interface InventoryCommand {
    item: string;
    previous: string | null;
    key: string;
    kind: InventoryAction;
    at: string;
    position: string;
    destination?: string;
    quantity: string;
    reservation?: string;
    count?: string;
    source: string;
}
export declare class Inventory {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private support;
    private positionRow;
    private apply;
    private read;
    position(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        unit: string;
        onHand: string;
        reserved: string;
        available: string;
        reorderGap: string;
        head: {} | null;
        events: Wire[];
    }, ForgeError, never>;
    move(input: InventoryCommand, ctx: CallContext): Effect.Effect<Wire, ForgeError, never>;
    reorder(id: string, ctx: CallContext): Effect.Effect<{
        position: {
            row: any;
            unit: string;
            onHand: string;
            reserved: string;
            available: string;
            reorderGap: string;
            head: {} | null;
            events: Wire[];
        };
        demand: {
            row: any;
            resolution: Wire | null;
            phase: string;
        };
        gap: string;
    }, ForgeError, never>;
    visibility(id: string, ctx: CallContext): Effect.Effect<{
        row: any;
        movement: any;
    }, ForgeError, never>;
}
