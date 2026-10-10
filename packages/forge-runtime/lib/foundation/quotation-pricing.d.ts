import { Effect } from "effect";
import type { Engine, CallContext } from "../engine.js";
import type { Wire } from "../decode.js";
import { type ForgeError } from "../errors.js";
import { type AcceptAgreement } from "./agreement-catalog.js";
/** Shared fixed-rate arithmetic for quoting and billing. No implicit rounding or FX. */
export declare function exactRateAmount(quantity: string, unitPrice: string): bigint;
export interface QuoteInput {
    key: string;
    offer: string;
    buyer: string;
    terms: string;
    pricedAt: string;
    expiresAt: string;
    lines: readonly {
        rate: string;
        quantity: string;
        adjustment?: string;
    }[];
    evaluation?: string;
    previous?: string;
}
export type QuoteAgreementInput = Omit<AcceptAgreement, "acceptanceKey" | "offer" | "customer" | "expectedTerms" | "predecessor" | "change">;
/** Six-decimal exact fixed rates plus signed fixed adjustments. No floating point,
 * implicit FX, silent rounding, posting or settlement. Agreement issuance resumes. */
export declare class Quotations {
    private readonly engine;
    constructor(engine: Engine);
    private call;
    private clean;
    private now;
    private price;
    publish(input: QuoteInput, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    inspect(quote: string, ctx: CallContext): Effect.Effect<{
        end: Wire | null;
        lines: Wire[];
        totals: Record<string, string>;
        quote: Wire;
    }, ForgeError, never>;
    expire(quote: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    private preflight;
    accept(quote: string, input: QuoteAgreementInput, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
    /** Authoritative issued agreement trace; raw accepted terminals remain pending intents. */
    agreement(quote: string, ctx: CallContext): Effect.Effect<Wire, ForgeError>;
}
