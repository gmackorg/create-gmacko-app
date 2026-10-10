import type { Engine } from "./engine.js";
import { ForgeError } from "./errors.js";
import type { Model } from "./model.js";
export interface Principal {
    tenant: string;
    actor: string;
    issuer?: string;
    /** Purposes the credential allows; a requested purpose outside this set is refused. */
    purposes?: string[];
    workload?: string;
}
export interface AuthHost {
    authenticate(req: Request): Promise<Principal | ForgeError>;
    /** Advertised in discovery so clients know which credential to present. */
    scheme?: string;
}
/** Development-only: trust `x-forge-tenant` / `x-forge-actor` headers. Must be enabled explicitly. */
export declare function devHeaderAuth(): AuthHost;
/** FORGE-056 discovery document: identity, digests, features and links. Counts, not a catalogue; the OpenAPI projection carries operations. */
export declare function discovery(model: Model, auth: AuthHost): Record<string, unknown>;
export interface HttpOptions {
    auth: AuthHost;
    requestId?: (req: Request) => string;
    /** Default 1 MiB; admin import bodies are allowed `adminMaxBodyBytes` (default 64 MiB). */
    maxBodyBytes?: number;
    adminMaxBodyBytes?: number;
    /** Allowed browser origins (exact, or "*"). Absent = no CORS headers. */
    cors?: {
        origins: string[];
    };
    /** Extra authenticated endpoints by exact path (e.g. an MCP server at `/forge/mcp`). */
    mounts?: Record<string, (req: Request, principal: Principal, requestId: string) => Promise<Response>>;
}
export declare function createHttpHandler(model: Model, engine: Engine, options: HttpOptions): (req: Request) => Promise<Response>;
