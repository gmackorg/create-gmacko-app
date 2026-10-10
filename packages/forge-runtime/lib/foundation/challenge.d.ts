import { Effect } from 'effect';
import type { Engine, CallContext } from '../engine.js';
import type { Wire } from '../decode.js';
import { type ForgeError } from '../errors.js';
export type ChallengeVerifier = (challenge: Wire, evaluation: Wire, ctx: CallContext) => Effect.Effect<boolean, ForgeError>;
/** Domain verifiers supply proof interpretation; this service owns durable friction only. */
export declare class Challenges {
    private readonly engine;
    private readonly verifier?;
    constructor(engine: Engine, verifier?: ChallengeVerifier | undefined);
    private call;
    private now;
    private support;
    private decision;
    private event;
    private approval;
    state(id: string, ctx: CallContext): Effect.Effect<{
        challenge: Wire;
        interaction: Wire;
        events: Wire[];
        phase: string;
    }, ForgeError>;
    attempt(id: string, evaluation: string, support: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    end(id: string, kind: 'cancelled' | 'expired', reason: string, ctx: CallContext): Effect.Effect<any, ForgeError, never>;
    assurance(id: string, subject: string, ctx: CallContext): Effect.Effect<{
        pip: string;
        attribute: string;
        value: boolean;
        challenge: string;
        interaction: unknown;
        subject: string;
        requirement: unknown;
        observedAt: string;
        expiresAt: string;
    }, ForgeError, never>;
}
