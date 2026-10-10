/**
 * Authentication adapters (plan §10.1, FORGE-047). A trusted invocation
 * context is bound at ingress from a verified credential, never from
 * request headers the caller controls. `jwtAuth` verifies issuer, audience,
 * algorithm, signature, `exp`/`nbf`, and maps claims to the principal
 * (tenant, actor, allowed purposes, workload) through an explicit claim map.
 * `devHeaderAuth` (http.ts) is the development-only header adapter.
 */
import type { AuthHost } from "./http.js";
export interface JwtAuthOptions {
    issuer: string;
    audience: string;
    /** HMAC secret (HS256) or a JWK set (RS256/ES256). */
    secret?: string;
    jwks?: {
        keys: JsonWebKey[];
    };
    /** Claim names for the principal fields. */
    claims: {
        tenant: string;
        actor: string;
        purposes?: string;
        workload?: string;
    };
    clockSkewSeconds?: number;
}
/** Test helper: sign an HS256 token. */
export declare function signTestJwt(payload: Record<string, unknown>, secret: string): Promise<string>;
export declare function jwtAuth(o: JwtAuthOptions): AuthHost;
