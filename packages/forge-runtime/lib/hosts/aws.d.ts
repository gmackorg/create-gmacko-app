import { type AuthHost } from "../http.js";
import { type AppBundle } from "../model.js";
import type { EngineOptions } from "../engine.js";
export interface ApiGatewayV2Event {
    rawPath: string;
    rawQueryString?: string;
    headers?: Record<string, string | undefined>;
    requestContext: {
        http: {
            method: string;
        };
        requestId: string;
        domainName?: string;
    };
    body?: string;
    isBase64Encoded?: boolean;
}
export interface ApiGatewayV2Result {
    statusCode: number;
    headers: Record<string, string>;
    body: string;
}
export declare function toRequest(ev: ApiGatewayV2Event): Request;
export declare function toResult(res: Response): Promise<ApiGatewayV2Result>;
export interface LambdaEnv {
    FORGE_TABLE: string;
    FORGE_BUCKET?: string;
    AWS_REGION?: string;
    CURSOR_SECRET: string;
    FORGE_AUTH?: string;
    FORGE_CORS?: string;
    /** JSON map: subscription name -> SQS queue URL. */
    FORGE_QUEUES?: string;
    /** JSON map: workflow name -> Step Functions state machine ARN. */
    FORGE_WORKFLOWS?: string;
    /** API Gateway WebSocket management endpoint (https://{api}.execute-api.{region}.amazonaws.com/{stage}). */
    FORGE_WS_ENDPOINT?: string;
}
/** API Gateway WebSocket route events ($connect / $disconnect / $default). */
export interface WebSocketEvent {
    requestContext: {
        routeKey: string;
        connectionId: string;
        eventType: "CONNECT" | "DISCONNECT" | "MESSAGE";
        domainName?: string;
        stage?: string;
        requestId: string;
    };
    queryStringParameters?: Record<string, string>;
    headers?: Record<string, string | undefined>;
    body?: string;
}
export interface LambdaOptions extends EngineOptions {
    auth?: AuthHost;
    env?: LambdaEnv;
}
/** One handler for API Gateway requests, SQS batches (consumer) and EventBridge schedules (sweep). */
export declare function createLambdaHandler(bundle: AppBundle, options?: LambdaOptions): (ev: ApiGatewayV2Event | SqsEvent | ScheduledEvent | WorkflowDriverEvent | ScheduleTickEvent | WebSocketEvent) => Promise<ApiGatewayV2Result | SqsBatchResponse | WorkflowDriverResult | void>;
export interface ScheduleTickEvent {
    forge: "schedule.tick";
    source?: string;
    /** Intended occurrence instant (EventBridge `time`, or `<aws.scheduler.scheduled-time>`). */
    time?: string;
}
export interface WorkflowDriverEvent {
    forge: "workflow.advance" | "workflow.wait";
    tenant: string;
    id: string;
    taskToken?: string;
}
export interface WorkflowDriverResult {
    status: string;
    dueAt: string;
    timeoutSeconds: number;
}
export interface SqsEvent {
    Records: {
        messageId: string;
        body: string;
        eventSourceARN: string;
    }[];
}
export interface SqsBatchResponse {
    batchItemFailures: {
        itemIdentifier: string;
    }[];
}
export interface ScheduledEvent {
    source: string;
}
