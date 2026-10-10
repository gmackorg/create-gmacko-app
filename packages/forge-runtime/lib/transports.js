/**
 * Delivery transports (plan §14): one durable queue per logical subscription.
 * Cloudflare Queues allow one consumer per queue, so the planner names a
 * queue per subscription; SQS likewise gets a queue per subscription.
 * Envelopes are JSON; the consumer host decodes them and calls
 * engine.consume(subscription, envelope), which dedups by messageId.
 */
import { Effect } from "effect";
/** Cloudflare Queues: `bindings[subscription]` is the queue producer binding. */
export function cloudflareQueuesTransport(bindings) {
    return {
        name: "cloudflare-queues",
        send: (d) => {
            const q = bindings[d.subscription];
            if (!q)
                return Effect.fail(new Error(`no queue binding for subscription ${d.subscription}`));
            return Effect.tryPromise({ try: () => q.send(d.envelope, { contentType: "json" }), catch: (e) => (e instanceof Error ? e : new Error(String(e))) });
        },
    };
}
/** AWS SQS: `urls[subscription]` is the queue URL. Standard queues; dedup is the consumer's job. */
export function sqsTransport(client, urls) {
    return {
        name: "sqs",
        send: (d) => {
            const url = urls[d.subscription];
            if (!url)
                return Effect.fail(new Error(`no queue url for subscription ${d.subscription}`));
            return Effect.tryPromise({ try: () => client.send(url, JSON.stringify(d.envelope), d.envelope.messageId), catch: (e) => (e instanceof Error ? e : new Error(String(e))) });
        },
    };
}
export function decodeEnvelope(raw) {
    const e = typeof raw === "string" ? JSON.parse(raw) : raw;
    if (!e || typeof e.messageId !== "string" || typeof e.tenant !== "string" || typeof e.channel !== "string")
        throw new Error("not a forge envelope");
    return e;
}
