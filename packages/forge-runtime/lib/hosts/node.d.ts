/**
 * Node host (FORGE-035, plan §5.4): the same Effect runtime behind a
 * Fetch-compatible HTTP server, an in-process WebSocket realtime hub, a
 * periodic durable sweep (outbox, crashed workflows, schedules), readiness/
 * liveness probes, bounded concurrency with 503 on overflow, and graceful
 * drain: on `stop()` the listener closes, in-flight requests finish, the sweep
 * completes its current pass and pending timers are cancelled. Durable state
 * (outbox rows, workflow instances, schedule ledgers) lives in the store, so
 * a restart resumes acknowledged work instead of losing it.
 */
import { type IncomingMessage, type Server, type ServerResponse } from "node:http";
import { type AuthHost } from "../http.js";
import { type OperationEvent } from "../telemetry.js";
import { type OtlpOptions } from "../otlp.js";
import { type ComposedRuntime, type RuntimeComposition } from "./compose.js";
export interface NodeHostOptions extends Omit<RuntimeComposition, "realtimeHub" | "telemetry" | "objects"> {
    /**
     * Authentication host. Required: the server refuses to start without one, so a deployment can never
     * silently trust caller-supplied identity headers. For local development set `FORGE_AUTH=dev-headers`
     * (or pass `devHeaderAuth()`) to trust `x-forge-tenant`/`x-forge-actor`.
     */
    auth?: AuthHost;
    /** Object storage: a directory (served by this host through signed URLs) or any object store adapter (S3, R2). */
    objects?: RuntimeComposition["objects"] | {
        directory: string;
    };
    /** Public base URL used inside signed object URLs; defaults to the bound address. */
    publicUrl?: string;
    cors?: string[];
    /** Sweep period; 0 disables the loop (tests drive `sweepAll` themselves). */
    sweepIntervalMs?: number;
    maxInFlight?: number;
    /** "json" (Workers-Logs shaped lines) or "emf" (CloudWatch EMF) on stdout, "otlp" (OTLP/HTTP to `otlp.endpoint`); default json. */
    telemetryFormat?: "json" | "emf" | "silent" | "otlp";
    otlp?: Omit<OtlpOptions, "serviceName" | "boundaries"> & {
        serviceName?: string;
    };
    telemetrySink?: (e: OperationEvent) => void;
}
export interface NodeHost {
    runtime: ComposedRuntime;
    server: Server;
    /** Bound address once listening. */
    address(): {
        port: number;
        url: string;
    };
    listen(port?: number, host?: string): Promise<{
        port: number;
        url: string;
    }>;
    stop(): Promise<void>;
    ready: boolean;
}
/** Node request → Fetch Request. */
export declare function toFetchRequest(req: IncomingMessage, base: string): Request;
export declare function writeFetchResponse(res: ServerResponse, r: Response): Promise<void>;
export declare function createNodeHost(options: NodeHostOptions): NodeHost;
