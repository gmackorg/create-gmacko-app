/**
 * DynamoDB storage adapter (plan §11), following the protocol certified by
 * the M0 spike: entity + unique claims + strong access items + audit + outbox
 * + receipt in one TransactWriteItems; bounded retry of TransactionConflict;
 * ClientRequestToken derived from the operation id.
 */
import { CreateTableCommand, DescribeTableCommand, DynamoDBClient, ResourceNotFoundException, UpdateTableCommand, waitUntilTableExists } from "@aws-sdk/client-dynamodb";
import { DynamoDBDocumentClient, GetCommand, PutCommand, QueryCommand, ScanCommand, TransactWriteCommand, UpdateCommand } from "@aws-sdk/lib-dynamodb";
import { unmarshall } from "@aws-sdk/util-dynamodb";
import { Effect } from "effect";
import { absenceWriteConflict } from "../atomic-guards.js";
import { encodeIdentity, sortKey } from "../codecs.js";
import { err } from "../errors.js";
import { fieldOf, scaleOf } from "../model.js";
export const PENDING_INDEX = "pending-index";
/** Attribute on a parent entity counting live children of (child, field). */
function depAttr(child, field, model) {
    return `dep#${model.wireName(child.id)}#${field}`;
}
const RETRY_ATTEMPTS = 5;
/** TransactWriteItems ceiling: 100 actions / 4 MB. */
const DYNAMO_TX_LIMIT = 100;
/** Merge only generated additive reference-counter updates, never entity writes,
 * hierarchy checks or effective-date revision SETs. All original guards survive. */
function mergeReferenceCounters(first, second) {
    if (!first.Update || !second.Update)
        return null;
    const updates = [first.Update, second.Update];
    const deltas = new Map(), names = {}, values = {}, conditions = [];
    for (const update of updates) {
        if (!update.UpdateExpression?.startsWith("ADD "))
            return null;
        for (const part of update.UpdateExpression.slice(4).split(",")) {
            const match = /^\s*(#[A-Za-z0-9_]+)\s+(:[A-Za-z0-9_]+)\s*$/.exec(part);
            if (!match)
                return null;
            const field = update.ExpressionAttributeNames?.[match[1]], delta = update.ExpressionAttributeValues?.[match[2]];
            if (!field?.startsWith("dep#") || !Number.isSafeInteger(delta))
                return null;
            const total = (deltas.get(field) ?? 0) + Number(delta);
            if (!Number.isSafeInteger(total))
                return null;
            deltas.set(field, total);
        }
        const renamedTokens = new Map();
        const rename = (token) => {
            let renamed = renamedTokens.get(token);
            if (!renamed) {
                renamed = token[0] + "g" + (Object.keys(names).length + Object.keys(values).length);
                renamedTokens.set(token, renamed);
            }
            return renamed;
        };
        // Copy only condition placeholders; unused placeholders are invalid in DynamoDB.
        if (update.ConditionExpression)
            conditions.push("(" + update.ConditionExpression.replace(/#[A-Za-z0-9_]+|:[A-Za-z0-9_]+/g, token => {
                const renamed = rename(token);
                if (token.startsWith("#"))
                    names[renamed] = update.ExpressionAttributeNames[token];
                else
                    values[renamed] = update.ExpressionAttributeValues[token];
                return renamed;
            }) + ")");
    }
    const adds = [];
    for (const [field, delta] of deltas) {
        const index = adds.length;
        names["#sum" + index] = field;
        values[":sum" + index] = delta;
        adds.push("#sum" + index + " :sum" + index);
    }
    return { Update: { TableName: first.Update.TableName, Key: first.Update.Key,
            UpdateExpression: "ADD " + adds.join(", "),
            ...(conditions.length ? { ConditionExpression: conditions.join(" AND ") } : {}),
            ExpressionAttributeNames: names, ExpressionAttributeValues: values,
            ...(first.Update.ReturnValuesOnConditionCheckFailure || second.Update.ReturnValuesOnConditionCheckFailure ? { ReturnValuesOnConditionCheckFailure: "ALL_OLD" } : {}),
        } };
}
/** Create the single data table + sparse pending index (idempotent). Deployment-time, never request-time. */
export async function ensureDynamoTable(table, region) {
    const raw = new DynamoDBClient({ region });
    const describe = async () => {
        try {
            return (await raw.send(new DescribeTableCommand({ TableName: table }))).Table;
        }
        catch (e) {
            if (e instanceof ResourceNotFoundException)
                return undefined;
            throw e;
        }
    };
    if (!(await describe())) {
        await raw.send(new CreateTableCommand({
            TableName: table,
            BillingMode: "PAY_PER_REQUEST",
            AttributeDefinitions: [
                { AttributeName: "PK", AttributeType: "S" },
                { AttributeName: "SK", AttributeType: "S" },
                { AttributeName: "pendingShard", AttributeType: "S" },
                { AttributeName: "pendingAt", AttributeType: "N" },
            ],
            KeySchema: [
                { AttributeName: "PK", KeyType: "HASH" },
                { AttributeName: "SK", KeyType: "RANGE" },
            ],
            GlobalSecondaryIndexes: [
                {
                    IndexName: PENDING_INDEX,
                    KeySchema: [
                        { AttributeName: "pendingShard", KeyType: "HASH" },
                        { AttributeName: "pendingAt", KeyType: "RANGE" },
                    ],
                    Projection: { ProjectionType: "ALL" },
                },
            ],
            Tags: [{ Key: "forge", Value: "data" }],
        }));
        await waitUntilTableExists({ client: raw, maxWaitTime: 300 }, { TableName: table });
    }
    else if (!(await describe())?.GlobalSecondaryIndexes?.some((g) => g.IndexName === PENDING_INDEX)) {
        await raw.send(new UpdateTableCommand({
            TableName: table,
            AttributeDefinitions: [
                { AttributeName: "PK", AttributeType: "S" },
                { AttributeName: "SK", AttributeType: "S" },
                { AttributeName: "pendingShard", AttributeType: "S" },
                { AttributeName: "pendingAt", AttributeType: "N" },
            ],
            GlobalSecondaryIndexUpdates: [{ Create: { IndexName: PENDING_INDEX, KeySchema: [{ AttributeName: "pendingShard", KeyType: "HASH" }, { AttributeName: "pendingAt", KeyType: "RANGE" }], Projection: { ProjectionType: "ALL" } } }],
        }));
    }
    for (let i = 0; i < 240; i++) {
        const t = await describe();
        if (t?.TableStatus === "ACTIVE" && t.GlobalSecondaryIndexes?.every((g) => g.IndexStatus === "ACTIVE"))
            return;
        await new Promise((r) => setTimeout(r, 2500));
    }
    throw new Error(`${table} did not become ACTIVE`);
}
export class DynamoStorage {
    model;
    atomicAbsenceGuards = true;
    atomicCompletion = true;
    name = "dynamodb";
    doc;
    table;
    constructor(opts, model) {
        this.model = model;
        this.table = opts.table;
        const raw = opts.client ?? new DynamoDBClient({ region: opts.region ?? "us-east-1" });
        this.doc = DynamoDBDocumentClient.from(raw, { marshallOptions: { removeUndefinedValues: true } });
    }
    // ------------------------------------------------------------ keys (identity.v1)
    wire(r) {
        return this.model.wireName(r.id);
    }
    entityKey(tenant, r, id) {
        return { PK: encodeIdentity(["T", tenant, "R", this.wire(r), "I", id]), SK: "ENTITY" };
    }
    claimKey(tenant, r, u, values) {
        return { PK: encodeIdentity(["T", tenant, "R", this.wire(r), "U", u.name, ...values]), SK: "CLAIM" };
    }
    accessPk(tenant, r, l, values) {
        return encodeIdentity(["T", tenant, "R", this.wire(r), "Q", l.name, ...values.map(String)]);
    }
    accessSk(r, l, rec) {
        const keys = l.order.map((o) => {
            const f = fieldOf(r, o.field);
            const type = f.type.base.kind === "scalar" ? f.type.base.name : f.type.base.kind;
            return sortKey(rec[o.field], type, { scale: scaleOf(f.type) });
        });
        return encodeIdentity(keys);
    }
    auditKey(tenant, opId) {
        return { PK: encodeIdentity(["T", tenant, "A", opId]), SK: "AUDIT" };
    }
    outboxKey(tenant, opId, ordinal) {
        return { PK: encodeIdentity(["T", tenant, "O", opId]), SK: `E#${String(ordinal).padStart(6, "0")}` };
    }
    receiptKey(tenant, operation, key) {
        return { PK: encodeIdentity(["T", tenant, "K", operation, key]), SK: "RECEIPT" };
    }
    wrap(f) {
        return Effect.tryPromise({ try: f, catch: (e) => err("StorageUnavailable", String(e.message ?? e)) });
    }
    toStored(r, item) {
        // dep#… counters and keys are physical metadata, never part of the record
        const rec = {};
        for (const f of r.fields)
            if (!f.derived)
                rec[f.name] = item[f.name] === undefined ? null : item[f.name];
        return rec;
    }
    // ------------------------------------------------------------ reads
    get(tenant, r, id) {
        return this.wrap(async () => {
            const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: this.entityKey(tenant, r, id), ConsistentRead: true }));
            return out.Item ? this.toStored(r, out.Item) : null;
        });
    }
    findUnique(tenant, r, u, _claimKey, values) {
        const fields = [...u.within, ...u.fields];
        const key = this.claimKey(tenant, r, u, fields.map((f) => String(values[f])));
        return this.wrap(async () => {
            const claim = await this.doc.send(new GetCommand({ TableName: this.table, Key: key, ConsistentRead: true }));
            const id = claim.Item?.["entityId"];
            if (typeof id !== "string")
                return null;
            const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: this.entityKey(tenant, r, id), ConsistentRead: true }));
            return out.Item ? this.toStored(r, out.Item) : null;
        });
    }
    list(tenant, r, q, _sortKeys) {
        const l = q.list;
        const pk = this.accessPk(tenant, r, l, l.fields.map((f) => q.values[f]));
        const forward = (l.order[0]?.direction ?? "asc") !== "desc";
        return this.wrap(async () => {
            const values = { ":pk": pk };
            let cond = "PK = :pk";
            if (q.after) {
                // The access item's SK is the encoded sort keys (the last one is the id tie-breaker).
                values[":after"] = encodeIdentity([...q.after.keys]);
                cond += forward ? " AND SK > :after" : " AND SK < :after";
            }
            const out = await this.doc.send(new QueryCommand({ TableName: this.table, ConsistentRead: true, KeyConditionExpression: cond, ExpressionAttributeValues: values, ScanIndexForward: forward, Limit: q.limit + 1 }));
            const items = (out.Items ?? []);
            const page = items.slice(0, q.limit);
            // Access items carry the full public record projection, so no second read is needed.
            return { records: page.map((i) => this.toStored(r, i["record"])), hasMore: items.length > q.limit };
        });
    }
    /**
     * Restrict-delete on DynamoDB uses a per-(child, field) live-dependent counter on the parent
     * entity (`dep#<child>#<field>`), maintained in the child's transaction (plan §11.4). The
     * pre-check reads it; the delete transaction conditions on it being zero or absent.
     */
    countDependents(tenant, child, field, id) {
        const parent = this.model.resource(fieldOf(child, field).type.base.kind === "reference" ? fieldOf(child, field).type.base.resource : "");
        return this.wrap(async () => {
            const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: this.entityKey(tenant, parent, id), ConsistentRead: true, ProjectionExpression: "#c", ExpressionAttributeNames: { "#c": depAttr(child, field, this.model) } }));
            return Number(out.Item?.[depAttr(child, field, this.model)] ?? 0);
        });
    }
    getReceipt(tenant, operation, key) {
        return this.wrap(async () => {
            const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: this.receiptKey(tenant, operation, key), ConsistentRead: true }));
            if (!out.Item)
                return null;
            const i = out.Item;
            return { tenant, operation, key, requestHash: String(i["requestHash"]), status: Number(i["status"]), response: i["response"], createdAt: String(i["createdAt"]) };
        });
    }
    // ------------------------------------------------------------ effective dating and hierarchy (§18)
    /** Interval rows of a group live under one partition (ordered by effectiveFrom) so neighbours are one bounded query. */
    intervalPk(tenant, r, groupValues) {
        return encodeIdentity(["T", tenant, "R", this.wire(r), "E", ...groupValues.map(String)]);
    }
    groupGuardKey(tenant, r, groupValues) {
        return { PK: this.intervalPk(tenant, r, groupValues), SK: "GUARD" };
    }
    async groupRows(tenant, r, groupValues) {
        const out = await this.doc.send(new QueryCommand({ TableName: this.table, ConsistentRead: true, KeyConditionExpression: "PK = :pk AND begins_with(SK, :i)", ExpressionAttributeValues: { ":pk": this.intervalPk(tenant, r, groupValues), ":i": "I#" }, Limit: 500 }));
        return (out.Items ?? []).map((i) => this.toStored(r, i["record"])).filter((x) => !x["deletedAt"]);
    }
    overlaps(rec, g) {
        if (rec["id"] === g.excludeId)
            return false;
        const from = String(rec["effectiveFrom"]);
        const until = rec["effectiveUntil"] ?? null;
        return (until === null || g.from < until) && (g.until === null || from < g.until);
    }
    overlapping(tenant, r, g) {
        return this.wrap(async () => {
            const guard = await this.doc.send(new GetCommand({ TableName: this.table, Key: this.groupGuardKey(tenant, r, g.groupValues), ConsistentRead: true }));
            g.revision = Number(guard.Item?.["rev"] ?? 0);
            return (await this.groupRows(tenant, r, g.groupValues)).filter((x) => this.overlaps(x, g));
        });
    }
    effectiveAt(tenant, r, _groupFields, groupValues, at) {
        return this.wrap(async () => (await this.groupRows(tenant, r, groupValues)).find((x) => String(x["effectiveFrom"]) <= at && (x["effectiveUntil"] == null || at < String(x["effectiveUntil"]))) ?? null);
    }
    /** Children of a node live under a per-parent partition (an access family maintained in the entity transaction). */
    childPk(tenant, r, parentId) {
        return encodeIdentity(["T", tenant, "R", this.wire(r), "C", parentId]);
    }
    children(tenant, r, _parentField, id, limit) {
        return this.wrap(async () => {
            const out = await this.doc.send(new QueryCommand({ TableName: this.table, ConsistentRead: true, KeyConditionExpression: "PK = :pk", ExpressionAttributeValues: { ":pk": this.childPk(tenant, r, id) }, Limit: limit }));
            return (out.Items ?? []).map((i) => this.toStored(r, i["record"])).filter((x) => !x["deletedAt"]);
        });
    }
    // ------------------------------------------------------------ outbox dispatch (sparse pending GSI + fenced lease, M0-certified)
    outboxRowOf(i) {
        return {
            tenant: String(i["tenant"]), opId: String(i["opId"]), ordinal: Number(i["ordinal"]), channel: String(i["channel"]), message: String(i["message"]),
            payload: i["payload"], createdAt: String(i["createdAt"]), status: i["status"], attempts: Number(i["attempts"] ?? 0),
            ...(i["trace"] ? { trace: i["trace"] } : {}),
            leaseOwner: i["leaseOwner"] ?? null, leaseUntil: i["leaseUntil"] === undefined ? null : Number(i["leaseUntil"]), delivered: i["delivered"] ?? [],
        };
    }
    /** A marker item per tenant in the "ALL" shard lets the sweep enumerate tenants with recent outbox activity. */
    tenantMarker(tenant, createdAt) {
        return { Put: { TableName: this.table, Item: { PK: encodeIdentity(["OUTBOX-TENANT", tenant]), SK: "MARKER", tenant, pendingShard: "ALL", pendingAt: Date.parse(createdAt) } } };
    }
    /** Tenants with outbox activity (markers in the ALL shard; harmless if a tenant has nothing pending). */
    outboxTenants() {
        return this.wrap(async () => {
            const out = await this.doc.send(new QueryCommand({ TableName: this.table, IndexName: PENDING_INDEX, KeyConditionExpression: "pendingShard = :s", ExpressionAttributeValues: { ":s": "ALL" }, Limit: 1000 }));
            return [...new Set((out.Items ?? []).map((i) => String(i["tenant"])))];
        });
    }
    outboxSweep(tenant, now, limit) {
        return this.wrap(async () => {
            const out = await this.doc.send(new QueryCommand({ TableName: this.table, IndexName: PENDING_INDEX, KeyConditionExpression: "pendingShard = :s", FilterExpression: "attribute_not_exists(leaseUntil) OR leaseUntil < :now", ExpressionAttributeValues: { ":s": encodeIdentity(["T", tenant]), ":now": now }, Limit: limit }));
            return (out.Items ?? []).map((i) => this.outboxRowOf(i));
        });
    }
    async conditional(cmd) {
        try {
            await this.doc.send(cmd);
            return true;
        }
        catch (e) {
            if (e.name === "ConditionalCheckFailedException")
                return false;
            throw e;
        }
    }
    outboxClaim(r, owner, now, leaseMs) {
        return this.wrap(() => this.conditional(new UpdateCommand({ TableName: this.table, Key: this.outboxKey(r.tenant, r.opId, r.ordinal), UpdateExpression: "SET leaseOwner = :o, leaseUntil = :u, attempts = if_not_exists(attempts, :zero) + :one", ConditionExpression: "#s = :pending AND (attribute_not_exists(leaseUntil) OR leaseUntil < :now)", ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: { ":o": owner, ":u": now + leaseMs, ":zero": 0, ":one": 1, ":pending": "pending", ":now": now } })));
    }
    outboxProgress(r, owner, u) {
        const sets = ["delivered = list_append(if_not_exists(delivered, :empty), :d)"];
        const removes = [];
        const values = { ":d": u.delivered, ":empty": [], ":pending": "pending", ":o": owner };
        if (u.done) {
            sets.push("#s = :ns");
            values[":ns"] = "delivered";
            removes.push("pendingShard", "pendingAt"); // leave the sparse index
        }
        else if (u.dead) {
            sets.push("#s = :ns", "pendingShard = :deadShard");
            values[":ns"] = "dead";
            values[":deadShard"] = encodeIdentity(["T", r.tenant, "dead"]); // parked in a listable shard
        }
        if (u.done || u.dead || u.releaseLease)
            removes.push("leaseOwner", "leaseUntil");
        const expr = `SET ${sets.join(", ")}${removes.length ? ` REMOVE ${removes.join(", ")}` : ""}`;
        return this.wrap(() => this.conditional(new UpdateCommand({ TableName: this.table, Key: this.outboxKey(r.tenant, r.opId, r.ordinal), UpdateExpression: expr, ConditionExpression: "#s = :pending AND leaseOwner = :o", ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: values })));
    }
    outboxDead(tenant) {
        return this.wrap(async () => {
            const out = await this.doc.send(new QueryCommand({ TableName: this.table, IndexName: PENDING_INDEX, KeyConditionExpression: "pendingShard = :s", ExpressionAttributeValues: { ":s": encodeIdentity(["T", tenant, "dead"]) } }));
            return (out.Items ?? []).map((i) => this.outboxRowOf(i));
        });
    }
    outboxRedrive(r) {
        return this.wrap(() => this.conditional(new UpdateCommand({ TableName: this.table, Key: this.outboxKey(r.tenant, r.opId, r.ordinal), UpdateExpression: "SET #s = :pending, attempts = :zero, pendingShard = :shard, pendingAt = :at REMOVE leaseOwner, leaseUntil", ConditionExpression: "#s = :dead", ExpressionAttributeNames: { "#s": "status" }, ExpressionAttributeValues: { ":pending": "pending", ":dead": "dead", ":zero": 0, ":shard": encodeIdentity(["T", r.tenant]), ":at": Date.now() } })));
    }
    hasProcessed(tenant, subscription, messageId) {
        return Effect.tryPromise({
            try: async () => !!(await this.doc.send(new GetCommand({ TableName: this.table, Key: { PK: encodeIdentity(["T", tenant, "P", subscription, messageId]), SK: "PROCESSED" }, ConsistentRead: true }))).Item,
            catch: (e) => err("StorageUnavailable", String(e)),
        });
    }
    markProcessed(tenant, subscription, messageId) {
        return Effect.tryPromise({
            try: async () => {
                await this.doc.send(new PutCommand({ TableName: this.table, Item: { PK: encodeIdentity(["T", tenant, "P", subscription, messageId]), SK: "PROCESSED", at: new Date().toISOString() }, ConditionExpression: "attribute_not_exists(PK)" }));
                return true;
            },
            catch: (e) => (e.name === "ConditionalCheckFailedException" ? "dup" : err("StorageUnavailable", String(e.message))),
        }).pipe(Effect.catch((e) => (e === "dup" ? Effect.succeed(false) : Effect.fail(e))));
    }
    // ------------------------------------------------------------ documents
    documentKey(tenant, kind, id) {
        return { PK: encodeIdentity(["T", tenant, "D", kind, id]), SK: "DOC" };
    }
    /** Entities have per-item partitions, so an export is a filtered Scan: admin-only, run behind the write fence. */
    exportPage(tenant, r, cursor, limit) {
        return this.wrap(async () => {
            const prefix = encodeIdentity(["T", tenant, "R", this.wire(r), "I", ""]);
            const out = await this.doc.send(new ScanCommand({ TableName: this.table, ConsistentRead: true, FilterExpression: "begins_with(PK, :p) AND SK = :e", ExpressionAttributeValues: { ":p": prefix, ":e": "ENTITY" }, Limit: Math.max(limit * 4, 100), ...(cursor ? { ExclusiveStartKey: JSON.parse(cursor) } : {}) }));
            const records = (out.Items ?? []).map((i) => this.toStored(r, i));
            return { records, next: out.LastEvaluatedKey ? JSON.stringify(out.LastEvaluatedKey) : null };
        });
    }
    getDocument(tenant, kind, id) {
        return this.wrap(async () => {
            const out = await this.doc.send(new GetCommand({ TableName: this.table, Key: this.documentKey(tenant, kind, id), ConsistentRead: true }));
            if (!out.Item)
                return null;
            const { PK, SK, docVersion, ...rest } = out.Item;
            void PK;
            void SK;
            return { ...rest, _version: Number(docVersion) };
        });
    }
    putDocuments(tenant, writes) {
        if (writes.length > 24 || new Set(writes.map(w => JSON.stringify([w.kind, w.id]))).size !== writes.length)
            return Effect.fail(err("BudgetExceeded", "document batch must contain at most 24 distinct keys"));
        if (!writes.length)
            return Effect.void;
        const items = writes.map(w => {
            const { _version, ...rest } = w.doc;
            void _version;
            return { Put: { TableName: this.table, Item: { ...rest, ...this.documentKey(tenant, w.kind, w.id), docVersion: (w.expectedVersion ?? 0) + 1 }, ConditionExpression: w.expectedVersion === null ? "attribute_not_exists(PK)" : "docVersion = :v", ...(w.expectedVersion === null ? {} : { ExpressionAttributeValues: { ":v": w.expectedVersion } }) } };
        });
        return Effect.tryPromise({ try: async () => { await this.doc.send(new TransactWriteCommand({ TransactItems: items })); }, catch: (e) => e.name === "TransactionCanceledException" ? err("VersionConflict", "document batch changed concurrently") : err("StorageUnavailable", String(e)) });
    }
    putDocument(tenant, kind, id, doc, expectedVersion) {
        const { _version, ...rest } = doc;
        void _version;
        const item = { ...this.documentKey(tenant, kind, id), ...rest, docVersion: (expectedVersion ?? 0) + 1 };
        return Effect.tryPromise({
            try: () => this.doc.send(new TransactWriteCommand({ TransactItems: [{ Put: { TableName: this.table, Item: item, ConditionExpression: expectedVersion === null ? "attribute_not_exists(PK)" : "docVersion = :v", ...(expectedVersion !== null ? { ExpressionAttributeValues: { ":v": expectedVersion } } : {}) } }] })),
            catch: (e) => (e.name === "TransactionCanceledException" ? err("VersionConflict", "document changed concurrently") : err("StorageUnavailable", String(e.message))),
        }).pipe(Effect.asVoid);
    }
    budget(plans, absent = []) {
        return { actions: this.transaction(plans, absent).items.length, limit: DYNAMO_TX_LIMIT };
    }
    // ------------------------------------------------------------ commit
    commit(plan) {
        return this.commitAll([plan]);
    }
    /** Assemble the physical transaction once for both budgeting and execution.
     * Shared reference counters commute; preserve every condition while combining
     * their deltas. Any other duplicate physical target is unsupported. */
    transaction(plans, absent = []) {
        const items = [], roles = [], owners = [];
        const positions = new Map();
        let error;
        const add = (item, role, owner) => {
            const action = item.Put ?? item.Update ?? item.Delete ?? item.ConditionCheck;
            const key = item.Put?.Item ?? item.Update?.Key ?? item.Delete?.Key ?? item.ConditionCheck?.Key;
            const identity = JSON.stringify([action?.TableName, key?.PK, key?.SK]);
            const prior = positions.get(identity);
            if (prior !== undefined) {
                const merged = roles[prior] === "parent" && role === "parent" ? mergeReferenceCounters(items[prior], item) : null;
                if (merged) {
                    items[prior] = merged;
                    return;
                }
                error ??= err("ValidationFailed", "Atomic DynamoDB mutations contain incompatible actions on the same item");
            }
            else
                positions.set(identity, items.length);
            items.push(item);
            roles.push(role);
            owners.push(owner);
        };
        for (const plan of plans) {
            const built = this.buildTransaction(plan);
            built.items.forEach((item, i) => add(item, built.roles[i], plan));
        }
        for (const guard of absent) {
            const fields = [...guard.unique.within, ...guard.unique.fields];
            add({ ConditionCheck: { TableName: this.table,
                    Key: this.claimKey(guard.tenant, guard.resource, guard.unique, fields.map(f => String(guard.values[f]))),
                    ConditionExpression: "attribute_not_exists(PK)",
                } }, "absence", plans[0]);
        }
        // One marker per tenant, included in exactly the same budget as the send.
        const marked = new Set();
        for (const plan of plans)
            if (plan.outbox.length && !marked.has(plan.tenant)) {
                marked.add(plan.tenant);
                add(this.tenantMarker(plan.tenant, plan.outbox[0].createdAt), "outbox", plan);
            }
        return { items, roles, owners, ...(error ? { error } : {}) };
    }
    commitAll(plans, absent = []) {
        const self = this;
        return Effect.gen(function* () {
            const conflict = absenceWriteConflict(plans, absent);
            if (conflict)
                return yield* Effect.fail(conflict);
            if (!plans.length)
                return yield* Effect.fail(err("ValidationFailed", "Atomic DynamoDB mutations require at least one plan"));
            const { items, roles, owners, error } = self.transaction(plans, absent);
            if (error)
                return yield* Effect.fail(error);
            if (items.length > DYNAMO_TX_LIMIT)
                return yield* Effect.fail(err("BudgetExceeded", `${items.length} physical actions exceed the transaction limit of ${DYNAMO_TX_LIMIT}`));
            for (let attempt = 1;; attempt++) {
                const outcome = yield* self.send(items, roles, owners, plans[0]);
                if (outcome === "ok")
                    return;
                if (outcome.code !== "TransientConflict" || attempt >= RETRY_ATTEMPTS)
                    return yield* Effect.fail(outcome);
                yield* Effect.sleep(Math.floor(Math.random() * 40 * attempt));
            }
        });
    }
    buildTransaction(plan) {
        const { resource: r, tenant, id } = plan;
        const items = [];
        const roles = [];
        const push = (role, item) => {
            roles.push(role);
            items.push(item);
        };
        if (plan.completion) {
            const w = plan.completion;
            const { _version, ...doc } = w.doc;
            void _version;
            push("completion", { Put: { TableName: this.table, Item: { ...doc, ...this.documentKey(tenant, w.kind, w.id), docVersion: (w.expectedVersion ?? 0) + 1 }, ConditionExpression: w.expectedVersion === null ? "attribute_not_exists(PK)" : "docVersion = :v", ...(w.expectedVersion === null ? {} : { ExpressionAttributeValues: { ":v": w.expectedVersion } }) } });
        }
        if (plan.kind === "publish") {
            const a = plan.audit;
            push("audit", { Put: { TableName: this.table, Item: { ...this.auditKey(tenant, a.opId), resource: a.resource, recordId: a.recordId, kind: a.kind, newVersion: a.newVersion, actor: a.actor, at: a.at } } });
            for (const o of plan.outbox) {
                push("outbox", { Put: { TableName: this.table, Item: { ...this.outboxKey(tenant, o.opId, o.ordinal), tenant, opId: o.opId, ordinal: o.ordinal, channel: o.channel, message: o.message, payload: o.payload, status: "pending", attempts: 0, delivered: [], pendingShard: encodeIdentity(["T", tenant]), pendingAt: Date.parse(o.createdAt), createdAt: o.createdAt, ...(o.trace ? { trace: o.trace } : {}) } } });
            }
            if (plan.receipt) {
                const rc = plan.receipt;
                push("receipt", { Put: { TableName: this.table, Item: { ...this.receiptKey(tenant, rc.operation, rc.key), requestHash: rc.requestHash, status: rc.status, response: rc.response, createdAt: rc.createdAt }, ConditionExpression: "attribute_not_exists(PK)" } });
            }
            return { items, roles };
        }
        const entityKey = this.entityKey(tenant, r, id);
        const depGuards = plan.dependents.map((d) => depAttr(d.resource, d.field, this.model));
        if (plan.kind === "create") {
            push("entity", { Put: { TableName: this.table, Item: { ...entityKey, ...plan.after }, ConditionExpression: "attribute_not_exists(PK)" } });
        }
        else if (plan.hardDelete) {
            const names = {};
            const conds = ["attribute_exists(PK)"];
            if (plan.expectedVersion !== null)
                conds.push("version = :v");
            depGuards.forEach((a, i) => {
                names[`#d${i}`] = a;
                conds.push(`(attribute_not_exists(#d${i}) OR #d${i} = :zero)`);
            });
            push("entity", { Delete: { TableName: this.table, Key: entityKey, ConditionExpression: conds.join(" AND "), ExpressionAttributeValues: { ...(plan.expectedVersion !== null ? { ":v": plan.expectedVersion } : {}), ...(depGuards.length ? { ":zero": 0 } : {}) }, ...(depGuards.length ? { ExpressionAttributeNames: names } : {}), ReturnValuesOnConditionCheckFailure: "ALL_OLD" } });
        }
        else {
            // Update (not Put) so dependent counters on this entity survive the write.
            const fields = Object.keys(plan.after).filter((k) => !plan.resource.fields.find((f) => f.name === k)?.derived);
            const names = {};
            const values = {};
            const sets = [];
            fields.forEach((k, i) => {
                names[`#f${i}`] = k;
                values[`:f${i}`] = plan.after[k] === undefined ? null : plan.after[k];
                sets.push(`#f${i} = :f${i}`);
            });
            const conds = ["attribute_exists(PK)"];
            if (plan.expectedVersion !== null) {
                conds.push("version = :v");
                values[":v"] = plan.expectedVersion;
            }
            depGuards.forEach((a, i) => {
                names[`#d${i}`] = a;
                conds.push(`(attribute_not_exists(#d${i}) OR #d${i} = :zero)`);
                values[":zero"] = 0;
            });
            push("entity", { Update: { TableName: this.table, Key: entityKey, UpdateExpression: `SET ${sets.join(", ")}`, ConditionExpression: conds.join(" AND "), ExpressionAttributeNames: names, ExpressionAttributeValues: values, ReturnValuesOnConditionCheckFailure: "ALL_OLD" } });
        }
        // unique claims
        for (const c of plan.claims) {
            if (c.before && c.before !== c.after) {
                push("claim", { Delete: { TableName: this.table, Key: this.claimKeyFromEncoded(tenant, r, c.unique, c.before, plan.before) } });
            }
            if (c.after && c.after !== c.before) {
                push("claim", { Put: { TableName: this.table, Item: { ...this.claimKeyFromEncoded(tenant, r, c.unique, c.after, plan.after), entityId: id }, ConditionExpression: "attribute_not_exists(PK) OR entityId = :me", ExpressionAttributeValues: { ":me": id } } });
            }
        }
        // strong access items: one per list query; moved when partition or sort keys change
        for (const l of r.lists) {
            const live = !plan.hardDelete && !plan.after["deletedAt"];
            const beforeKey = plan.before && !plan.before["deletedAt"] ? { PK: this.accessPk(tenant, r, l, l.fields.map((f) => plan.before[f])), SK: this.accessSk(r, l, plan.before) } : null;
            const afterKey = live ? { PK: this.accessPk(tenant, r, l, l.fields.map((f) => plan.after[f])), SK: this.accessSk(r, l, plan.after) } : null;
            const same = beforeKey && afterKey && beforeKey.PK === afterKey.PK && beforeKey.SK === afterKey.SK;
            if (beforeKey && !same)
                push("access", { Delete: { TableName: this.table, Key: beforeKey } });
            if (afterKey)
                push("access", { Put: { TableName: this.table, Item: { ...afterKey, record: plan.after, id, version: plan.after["version"] ?? null } } });
        }
        // effective dating: an interval item per record in the group partition + a per-group revision guard.
        // Every mutation of the group bumps the guard; planning read the group under the same revision, so a
        // concurrent overlapping write is rejected by the guard condition (§18).
        if (r.decorators.effectiveDated) {
            const ed = r.decorators.effectiveDated;
            const groupOf = (rec) => (rec ? ed.uniqueBy.map((f) => rec[f]) : null);
            const beforeGroup = plan.before && !plan.before["deletedAt"] ? groupOf(plan.before) : null;
            const afterGroup = !plan.hardDelete && !plan.after["deletedAt"] ? groupOf(plan.after) : null;
            const sk = (rec) => `I#${String(rec["effectiveFrom"])}#${id}`;
            if (beforeGroup && (!afterGroup || beforeGroup.join("\u0001") !== afterGroup.join("\u0001") || sk(plan.before) !== sk(plan.after))) {
                push("access", { Delete: { TableName: this.table, Key: { PK: this.intervalPk(tenant, r, beforeGroup), SK: sk(plan.before) } } });
            }
            if (afterGroup) {
                push("access", { Put: { TableName: this.table, Item: { PK: this.intervalPk(tenant, r, afterGroup), SK: sk(plan.after), record: plan.after, id } } });
            }
            if (plan.interval) {
                const expected = plan.interval.revision ?? 0;
                push("parent", { Update: { TableName: this.table, Key: this.groupGuardKey(tenant, r, plan.interval.groupValues), UpdateExpression: "SET rev = :next", ConditionExpression: "attribute_not_exists(rev) OR rev = :expected", ExpressionAttributeValues: { ":next": expected + 1, ":expected": expected } } });
            }
        }
        // hierarchy: a child index item per node under its parent's partition, moved with the node
        if (r.decorators.hierarchical) {
            const bp = plan.before && !plan.before["deletedAt"] ? plan.before["parent"] : null;
            const ap = !plan.hardDelete && !plan.after["deletedAt"] ? plan.after["parent"] : null;
            if (bp && bp !== ap)
                push("access", { Delete: { TableName: this.table, Key: { PK: this.childPk(tenant, r, bp), SK: `${String(plan.before["name"] ?? "")}#${id}` } } });
            if (ap)
                push("access", { Put: { TableName: this.table, Item: { PK: this.childPk(tenant, r, ap), SK: `${String(plan.after["name"] ?? "")}#${id}`, record: plan.after, id } } });
        }
        // Tree pins: every observed ancestor must still have the parent we saw. Pins on items that also receive a
        // counter Update below are folded into that Update (DynamoDB allows one action per item).
        const pins = new Map();
        if (r.decorators.hierarchical && plan.tree) {
            const chain = [plan.tree.parentId, ...plan.tree.ancestors.slice(1)];
            for (let i = 0; i < chain.length; i++) {
                const node = chain[i];
                if (node === id)
                    continue;
                pins.set(node, plan.tree.ancestors[i + 1] ?? null);
            }
        }
        // reference guards: the parent must be live; its live-dependent counter for (this resource, field)
        // is incremented when the reference is created and decremented when it is removed or the child is
        // hard-deleted. One Update per parent item (DynamoDB forbids two actions on one item).
        const counterDeltas = new Map();
        const bump = (parentRes, parentId, attr, delta) => {
            const k = `${parentRes.id}|${parentId}`;
            const e = counterDeltas.get(k) ?? { resource: parentRes, id: parentId, deltas: {} };
            e.deltas[attr] = (e.deltas[attr] ?? 0) + delta;
            counterDeltas.set(k, e);
        };
        for (const f of r.fields) {
            if (f.type.base.kind !== "reference" || (f.synthesized && f.name !== "parent"))
                continue;
            const parentRes = this.model.resource(f.type.base.resource);
            const attr = depAttr(r, f.name, this.model);
            const beforeLive = plan.before && !plan.before["deletedAt"] ? plan.before[f.name] : null;
            const afterLive = !plan.hardDelete && !plan.after["deletedAt"] ? plan.after[f.name] : null;
            if (beforeLive !== afterLive) {
                if (typeof beforeLive === "string")
                    bump(parentRes, beforeLive, attr, -1);
                if (typeof afterLive === "string")
                    bump(parentRes, afterLive, attr, +1);
            }
        }
        const guardIds = new Set(plan.references.map((g) => `${g.resource.id}|${g.id}`));
        for (const [k, e] of counterDeltas) {
            const names = {};
            const values = {};
            const adds = [];
            Object.entries(e.deltas).forEach(([attr, delta], i) => {
                if (delta === 0)
                    return;
                names[`#c${i}`] = attr;
                values[`:c${i}`] = delta;
                adds.push(`#c${i} :c${i}`);
            });
            if (!adds.length)
                continue;
            const mustBeLive = guardIds.has(k) && e.resource.decorators.softDelete;
            const conds = ["attribute_exists(PK)"];
            if (mustBeLive) {
                conds.push("deletedAt = :null");
                values[":null"] = null;
            }
            // Hierarchy pin on this same item (tree guard) rides in the same Update.
            if (e.resource.id === r.id && pins.has(e.id)) {
                const expectedParent = pins.get(e.id) ?? null;
                pins.delete(e.id);
                if (expectedParent) {
                    conds.push("parent = :tp");
                    values[":tp"] = expectedParent;
                }
                else {
                    conds.push("(attribute_not_exists(parent) OR parent = :tnull)");
                    values[":tnull"] = null;
                }
            }
            push("parent", { Update: { TableName: this.table, Key: this.entityKey(tenant, e.resource, e.id), UpdateExpression: `ADD ${adds.join(", ")}`, ConditionExpression: conds.join(" AND "), ExpressionAttributeNames: names, ExpressionAttributeValues: values } });
        }
        for (const [node, expectedParent] of pins) {
            push("parent", { ConditionCheck: { TableName: this.table, Key: this.entityKey(tenant, r, node), ConditionExpression: expectedParent ? "attribute_exists(PK) AND parent = :p" : "attribute_exists(PK) AND (attribute_not_exists(parent) OR parent = :null)", ExpressionAttributeValues: expectedParent ? { ":p": expectedParent } : { ":null": null } } });
        }
        for (const g of plan.references) {
            if (g.field === "parent" && plan.tree)
                continue; // pinned by the tree guard's ConditionChecks
            if (counterDeltas.has(`${g.resource.id}|${g.id}`))
                continue; // already guarded by the counter update
            const live = g.resource.decorators.softDelete ? "attribute_exists(PK) AND deletedAt = :null" : "attribute_exists(PK)";
            push("parent", { ConditionCheck: { TableName: this.table, Key: this.entityKey(tenant, g.resource, g.id), ConditionExpression: live, ...(g.resource.decorators.softDelete ? { ExpressionAttributeValues: { ":null": null } } : {}) } });
        }
        const a = plan.audit;
        push("audit", { Put: { TableName: this.table, Item: { ...this.auditKey(tenant, a.opId), resource: a.resource, recordId: a.recordId, kind: a.kind, newVersion: a.newVersion, actor: a.actor, at: a.at, ...(a.payload !== undefined ? { payload: a.payload } : {}) } } });
        for (const o of plan.outbox) {
            push("outbox", { Put: { TableName: this.table, Item: { ...this.outboxKey(tenant, o.opId, o.ordinal), tenant, opId: o.opId, ordinal: o.ordinal, channel: o.channel, message: o.message, payload: o.payload, status: "pending", attempts: 0, delivered: [], pendingShard: encodeIdentity(["T", tenant]), pendingAt: Date.parse(o.createdAt), createdAt: o.createdAt, ...(o.trace ? { trace: o.trace } : {}) } } });
        }
        if (plan.receipt) {
            const rc = plan.receipt;
            push("receipt", { Put: { TableName: this.table, Item: { ...this.receiptKey(tenant, rc.operation, rc.key), requestHash: rc.requestHash, status: rc.status, response: rc.response, createdAt: rc.createdAt }, ConditionExpression: "attribute_not_exists(PK)" } });
        }
        return { items, roles };
    }
    /** The engine encodes claim keys as identity(resourceId, unique, ...values); map to the physical key. */
    claimKeyFromEncoded(tenant, r, u, _encoded, rec) {
        const fields = [...u.within, ...u.fields];
        return this.claimKey(tenant, r, u, fields.map((f) => String(rec[f])));
    }
    send(items, roles, owners, first) {
        return Effect.promise(async () => {
            try {
                // Deterministic token per logical command: a retried/replayed identical command is idempotent for 10 minutes.
                await this.doc.send(new TransactWriteCommand({ TransactItems: items, ClientRequestToken: first.opId.slice(0, 36) }));
                return "ok";
            }
            catch (e) {
                return this.classify(e, roles, owners, first);
            }
        });
    }
    classify(e, roles, owners, first) {
        let plan = first;
        const ex = e;
        if (ex.name === "IdempotentParameterMismatchException")
            return err("TransientConflict", "client token collision");
        if (ex.name === "TransactionInProgressException")
            return err("TransientConflict", "transaction in progress");
        if (ex.name !== "TransactionCanceledException")
            return err("StorageUnavailable", String(ex.message ?? e));
        const reasons = (ex.CancellationReasons ?? []).map((r, i) => ({ role: roles[i], code: r.Code, message: r.Message, item: r.Item ? unmarshall(r.Item) : undefined }));
        if (reasons.some((r) => r.code === "TransactionConflict"))
            return err("TransientConflict", "transaction conflict");
        const failed = reasons.find((r) => r.code === "ConditionalCheckFailed");
        if (failed)
            plan = owners[reasons.indexOf(failed)] ?? first;
        switch (failed?.role) {
            case "completion": return err("VersionConflict", "subscription claim changed");
            case "absence": return err("VersionConflict", "Atomic absence guard failed");
            case "entity": {
                if (plan.kind === "create")
                    return err("TransientConflict", "id collision");
                const old = failed.item;
                if (!old)
                    return err("NotFound", `${plan.resource.name} ${plan.id} not found`);
                if (plan.expectedVersion !== null && old["version"] !== plan.expectedVersion)
                    return err("VersionConflict", `expected version ${plan.expectedVersion}, current is ${old["version"]}`);
                if (plan.dependents.some((d) => Number(old[depAttr(d.resource, d.field, this.model)] ?? 0) > 0))
                    return err("HasDependents", `${plan.resource.name} ${plan.id} has live dependents`);
                return err("TransientConflict", "entity condition failed");
            }
            case "claim": {
                const idx = reasons.findIndex((r) => r === failed);
                const planStart = owners.indexOf(plan);
                const claimIdx = roles.slice(planStart, idx).filter((r) => r === "claim").length;
                const changes = plan.claims.filter((c) => c.after && c.after !== c.before);
                const u = changes[Math.min(claimIdx, changes.length - 1)]?.unique;
                return err("UniqueConflict", "a record with the same unique key exists", u ? { constraint: `${plan.resource.id}.unique.${u.name}` } : {});
            }
            case "parent":
                if (plan.interval)
                    return err("ValidationFailed", "interval group changed concurrently; retry", { fields: [{ path: "effectiveFrom", code: "IntervalOverlap", message: "group revision guard failed" }] });
                if (plan.tree)
                    return err("ValidationFailed", "hierarchy changed concurrently; retry", { fields: [{ path: "parent", code: "Cycle", message: "tree guard failed at commit" }] });
                return err("ReferenceMissing", "referenced record is not live in this tenant");
            case "receipt":
                return err("TransientConflict", "receipt already written");
            default:
                return err("StorageUnavailable", `transaction cancelled: ${reasons.map((r) => `${r.role}=${r.code}${r.message ? `(${r.message})` : ""}`).join(",")}`);
        }
    }
}
