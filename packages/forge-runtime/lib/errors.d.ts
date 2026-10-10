export interface ProblemField {
    path: string;
    code: string;
    message: string;
}
export declare const ERROR_STATUS: Record<string, {
    status: number;
    retryable: boolean;
    title: string;
}>;
declare const ForgeError_base: new <A extends Record<string, any> = {}>(args: import("effect/Types").VoidIfEmpty<{ readonly [P in keyof A as P extends "_tag" ? never : P]: A[P]; }>) => import("effect/Cause").YieldableError & {
    readonly _tag: "ForgeError";
} & Readonly<A>;
export declare class ForgeError extends ForgeError_base<{
    code: string;
    detail?: string;
    fields?: ProblemField[];
    constraint?: string;
    /** Structured, provider-specific detail (e.g. the physical atomic budget); never free text. */
    budget?: Record<string, number>;
}> {
    /** Declared domain errors (`<function id>.<Name>`) are 409 unless declared otherwise. */
    get status(): number;
    get retryable(): boolean;
    /** RFC 9457 body with the stable Forge extensions. */
    problem(requestId: string): Record<string, unknown>;
}
export declare const err: (code: string, detail?: string, extra?: {
    fields?: ProblemField[];
    constraint?: string;
    budget?: Record<string, number>;
}) => ForgeError;
export {};
