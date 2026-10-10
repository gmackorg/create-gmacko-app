import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export type ThreadEventKind = 'Entry' | 'Reaction' | 'Mention' | 'Attachment' | 'Close' | 'Reopen';
export interface ThreadActivity {
    events: Wire[];
    closed: boolean;
    head: string | null;
}
/** Candidate facts become visible activity only through the guarded thread journal. */
export declare class Collaborations {
    private readonly engine;
    constructor(engine: Engine);
    private participant;
    activity(thread: string, ctx: CallContext): Effect.Effect<ThreadActivity, ForgeError>;
    publish(input: {
        thread: string;
        actor: string;
        kind: ThreadEventKind;
        at: string;
        previous: string | null;
        fact?: string;
    }, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
