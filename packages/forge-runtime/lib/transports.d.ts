import type { Envelope, Transport } from "./dispatch.js";
export interface QueueLike {
    send(body: unknown, options?: {
        contentType?: string;
    }): Promise<void>;
}
/** Cloudflare Queues: `bindings[subscription]` is the queue producer binding. */
export declare function cloudflareQueuesTransport(bindings: Record<string, QueueLike>): Transport;
export interface SqsLike {
    send(queueUrl: string, body: string, dedupId: string): Promise<void>;
}
/** AWS SQS: `urls[subscription]` is the queue URL. Standard queues; dedup is the consumer's job. */
export declare function sqsTransport(client: SqsLike, urls: Record<string, string>): Transport;
export declare function decodeEnvelope(raw: unknown): Envelope;
