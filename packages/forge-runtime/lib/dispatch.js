/**
 * Outbox dispatcher (plan §14). Sweep -> claim (lease) -> deliver to every
 * logical subscription -> record per-subscription progress -> complete.
 * At-least-once: a transport may be told twice; consumers dedup by messageId.
 * Poison rows park as `dead` after maxAttempts and can be redriven.
 */
import { sha256, stableJson } from "./engine.js";
import { SubscriptionDelivery } from "./subscription-delivery.js";
import { Effect } from "effect";
export function envelopeOf(row) {
    return { channel: row.channel, message: row.message, tenant: row.tenant, opId: row.opId, ordinal: row.ordinal, messageId: `${row.opId}:${row.ordinal}`, payload: row.payload, createdAt: row.createdAt };
}
export class Dispatcher {
    model;
    storage;
    transport;
    opts;
    owner;
    constructor(model, storage, transport, opts) {
        this.model = model;
        this.storage = storage;
        this.transport = transport;
        this.opts = opts;
        this.owner = opts.owner ?? `dispatcher-${Math.random().toString(36).slice(2, 10)}`;
    }
    subscriptionsFor(channel) {
        return this.opts.subscriptions[channel] ?? [];
    }
    /** One pass: bounded, safe to run concurrently with other dispatchers (claims are conditional). */
    sweep(tenant, o) {
        const self = this;
        return Effect.gen(function* () {
            const report = { claimed: 0, delivered: 0, failed: 0, dead: 0 };
            const rows = yield* self.storage.outboxSweep(tenant, o.now, self.opts.batch ?? 50);
            for (const row of rows) {
                const key = { tenant: row.tenant, opId: row.opId, ordinal: row.ordinal };
                const claimed = yield* self.storage.outboxClaim(key, self.owner, o.now, self.opts.leaseMs);
                if (!claimed)
                    continue;
                report.claimed++;
                const subs = self.subscriptionsFor(row.channel);
                const env = envelopeOf(row);
                const done = [...row.delivered];
                let failedAny = false;
                for (const sub of subs) {
                    if (done.includes(sub))
                        continue; // already delivered on an earlier attempt: never repeat it
                    const exit = yield* Effect.exit(self.transport.send({ subscription: sub, envelope: env }));
                    if (exit._tag === "Success") {
                        done.push(sub);
                        report.delivered++;
                        // persist per-subscription progress immediately so a crash here cannot re-deliver to `sub`
                        yield* self.storage.outboxProgress(key, self.owner, { delivered: [sub] });
                    }
                    else {
                        failedAny = true;
                        report.failed++;
                    }
                }
                // Per-subscription progress was persisted as each delivery succeeded; the final write only changes status.
                if (!failedAny) {
                    yield* self.storage.outboxProgress(key, self.owner, { delivered: [], done: true });
                }
                else if (row.attempts + 1 >= self.opts.maxAttempts) {
                    yield* self.storage.outboxProgress(key, self.owner, { delivered: [], dead: true });
                    report.dead++;
                }
                // else: keep the lease until it expires (natural backoff), then another sweep retries the rest
            }
            return report;
        });
    }
    dead(tenant) {
        return this.storage.outboxDead(tenant);
    }
    redrive(tenant, opId, ordinal) {
        return this.storage.outboxRedrive({ tenant, opId, ordinal });
    }
    /** Wrap an opaque callback. Its effects cannot join our transaction, so a failure or crash
     * after callback intent is recorded requires reconciliation. Prefer Engine.consume for
     * declared handlers whose local writes can commit atomically with completion. */
    consumer(subscription, handler) {
        return async (env) => {
            const hash = await sha256(stableJson({ channel: env.channel, message: env.message, payload: env.payload }));
            const delivery = await SubscriptionDelivery.claim(this.storage, env.tenant, subscription, env.messageId, hash, Date.now);
            if (!delivery)
                return "duplicate";
            try {
                await Effect.runPromise(delivery.beforeExternal());
                await handler(env);
                const w = delivery.completion();
                await Effect.runPromise(this.storage.putDocument(env.tenant, w.kind, w.id, w.doc, w.expectedVersion));
            }
            catch (e) {
                await delivery.failed();
                throw e;
            }
            return "processed";
        };
    }
}
