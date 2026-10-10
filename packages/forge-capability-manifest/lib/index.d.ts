export declare const MANIFEST_VERSION = "capability-manifest/1";
export type Support = "native" | "bounded-emulation" | "unsupported";
export type Resolution = Support | "unknown";
export interface Evidence {
    kind: "conformance-report" | "test" | "vendor-doc" | "attestation";
    ref: string;
}
export interface CapabilityClaim {
    id: string;
    support: Support;
    /** Numeric bounds (e.g. `{ actions: 100, bytes: 1048576 }`); a requirement's bound must fit inside. */
    bound?: Record<string, number>;
    assumptions?: string[];
    evidence: Evidence[];
}
export interface CapabilityManifest {
    version: typeof MANIFEST_VERSION;
    id: string;
    kind: "adapter" | "taxonomy" | "importer";
    adapterVersion: string;
    engine: {
        name: string;
        version: string;
    };
    runtime: {
        name: string;
        version: string;
    };
    isolation?: string[];
    consistency?: string[];
    capabilities: CapabilityClaim[];
}
export interface Requirement {
    id: string;
    bound?: Record<string, number>;
}
export interface Resolved {
    support: Resolution;
    bound?: Record<string, number>;
    assumptions?: string[];
    evidence?: Evidence[];
    reason?: string;
}
export interface AdapterResolution {
    adapter: string;
    digest: string;
    resolutions: Record<string, Resolved>;
    satisfied: boolean;
    unsatisfied: string[];
}
export declare function digestOf(m: CapabilityManifest): string;
export declare function validateManifest(m: CapabilityManifest): {
    ok: true;
} | {
    ok: false;
    errors: string[];
};
/** Resolve requirements against manifests: sorted output, no clamping, unknown stays unknown. */
export declare function resolveRequirements(requirements: Requirement[], manifests: CapabilityManifest[]): AdapterResolution[];
export * from "./execution.js";
