import { type ForgeError } from "./errors.js";
import { type Field, type Model, type Resource, type TypeSpec } from "./model.js";
export type Wire = Record<string, unknown>;
/** Decode one wire value of a declared type into its canonical form. */
export declare function decodeValue(model: Model, t: TypeSpec, input: unknown, depth?: number): unknown;
export declare function defaultOf(model: Model, f: Field): unknown;
export interface DecodeOptions {
    /** create: apply defaults, require required fields; patch: absent = unchanged, null clears optionals */
    mode: "create" | "patch" | "input";
    fields: Field[];
}
/** Decode a wire object against a field list. Collects every failure. */
export declare function decodeObject(model: Model, input: unknown, opts: DecodeOptions): {
    value: Wire;
    errors: ForgeError | null;
};
/** Wire-canonical output: every declared field present, derived fields computed. */
export declare function canonicalize(model: Model, r: Resource, stored: Wire): Wire;
/** Input value for a reference to the record being written, whose id is server-assigned (#200). */
export declare const SELF_REFERENCE = "$self";
/** Functions an expression may call. The compiler accepts exactly these (E-EXPR-004). */
export declare const EXPRESSION_FUNCTIONS: readonly ["floor"];
/** Minimal expression evaluation for derived fields and rules. */
export declare function evalExpr(model: Model, r: Resource, e: import("./model.js").Expr, rec: Wire, hint?: TypeSpec, refs?: Record<string, Wire | null>): unknown;
