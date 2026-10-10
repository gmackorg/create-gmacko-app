/**
 * Boundary codecs, normalizers, constraints, and key codecs. Normative
 * behaviour lives in specs/codecs/README.md; every vector file there runs
 * against this module.
 */
export declare class CodecError extends Error {
    readonly code: string;
    constructor(code: string, message?: string);
}
export declare function decodeText(input: unknown, normalizers?: string[]): string;
/** Length in Unicode scalar values of NFC-normalized text. */
export declare function codePointLength(s: string): number;
export declare function checkLength(s: string, min?: number, max?: number): string;
export declare function decodeInteger(input: unknown, opts?: {
    min?: number | undefined;
    max?: number | undefined;
    rawJson?: string | undefined;
}): number;
export declare function currencyScale(currency: string): number;
/** Exact fixed-point decoding to minor units (bigint), then canonical string at the declared scale. */
export declare function decodeDecimal(input: unknown, opts: {
    scale?: number | undefined;
    currency?: string | undefined;
    min?: string | undefined;
    max?: string | undefined;
}): string;
export declare function toMinor(text: string, scale: number): bigint;
export declare function formatMinor(minor: bigint, scale: number): string;
export declare function decodeDate(input: unknown): string;
export declare function decodeDatetime(input: unknown, precision?: "ms" | "s"): string;
export declare function decodeLocalTime(input: unknown): string;
export declare function decodeDuration(input: unknown): string;
export declare function decodeEnum(input: unknown, values: string[]): string;
/** Order-preserving encoding (sort.v1). */
export declare function sortKey(value: unknown, type: string, opts?: {
    scale?: number | undefined;
}): string;
/** Compare two encoded sort keys by UTF-8 byte order (what D1 BINARY and DynamoDB use). */
export declare function compareBytes(a: string, b: string): number;
export declare function encodeIdentity(components: string[]): string;
export declare function decodeIdentity(key: string): string[];
export interface VectorCase {
    name: string;
    params: Record<string, unknown>;
    input?: unknown;
    input_json?: string;
    input_list?: unknown[];
    expect?: unknown;
    error?: string;
    expect_order?: unknown[];
    expect_distinct?: boolean;
}
type Outcome = {
    value: unknown;
} | {
    error: string;
} | {
    order: unknown[];
} | {
    distinct: boolean;
};
export declare function runVector(codec: string, v: VectorCase): Outcome;
export {};
