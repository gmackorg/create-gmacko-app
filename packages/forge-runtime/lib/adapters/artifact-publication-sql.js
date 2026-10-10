import { artifactPublicationIntentKey, } from "../artifact-publication.js";
const scope = (i) => [
    i.revision.tenant,
    i.revision.artifact,
    i.key,
];
export class SqlArtifactPublicationJournal {
    sql;
    constructor(sql) {
        this.sql = sql;
    }
    /** Explicit migration hook; call during provisioning, not on a request path. */
    async initialize() {
        await this.sql.run({
            sql: `CREATE TABLE IF NOT EXISTS forge_artifact_publications (
      tenant TEXT NOT NULL, artifact TEXT NOT NULL, operation_key TEXT NOT NULL,
      intent TEXT NOT NULL, outcome TEXT NOT NULL CHECK(outcome IN ('pending','accepted','rejected','observed')),
      PRIMARY KEY (tenant, artifact, operation_key))`,
            params: [],
        });
    }
    async get(intent) {
        const row = await this.sql.first({
            sql: "SELECT intent,outcome FROM forge_artifact_publications WHERE tenant=? AND artifact=? AND operation_key=?",
            params: scope(intent),
        });
        if (!row)
            return null;
        const [key, ref, expected, actor, purpose, tenant, artifact, generation, repositoryId, objectFormat, oid, tree,] = JSON.parse(row.intent);
        return {
            intent: {
                key,
                ref,
                expected,
                actor,
                purpose,
                revision: {
                    tenant,
                    artifact,
                    generation,
                    repositoryId,
                    objectFormat,
                    oid,
                    tree,
                },
            },
            outcome: row.outcome,
        };
    }
    async claim(intent) {
        const result = await this.sql.run({
            sql: "INSERT INTO forge_artifact_publications (tenant,artifact,operation_key,intent,outcome) VALUES (?,?,?,?,'pending') ON CONFLICT (tenant,artifact,operation_key) DO NOTHING",
            params: [...scope(intent), artifactPublicationIntentKey(intent)],
        });
        const receipt = await this.get(intent);
        if (!receipt)
            throw Error("Missing publication intent");
        return { owned: result.changes === 1, receipt };
    }
    async finish(intent, outcome) {
        await this.sql.run({
            sql: "UPDATE forge_artifact_publications SET outcome=? WHERE tenant=? AND artifact=? AND operation_key=? AND intent=? AND outcome='pending'",
            params: [outcome, ...scope(intent), artifactPublicationIntentKey(intent)],
        });
        const receipt = await this.get(intent);
        if (!receipt ||
            artifactPublicationIntentKey(receipt.intent) !==
                artifactPublicationIntentKey(intent))
            throw Error("Publication intent mismatch");
        return receipt;
    }
}
