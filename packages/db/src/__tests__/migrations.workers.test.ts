/**
 * The migration set on a real (Miniflare) D1, the way `wrangler d1
 * migrations apply` runs it: every file as one batch, i.e. one transaction.
 *
 * Two facts the auth-schema header and the README rely on:
 *   1. the full set applies from an empty database;
 *   2. drizzle-kit's table-rebuild recipe (`PRAGMA foreign_keys=OFF`, create
 *      `__new_x`, copy, `DROP TABLE x`, rename) is NOT safe on D1 once rows
 *      reference the table: SQLite ignores `PRAGMA foreign_keys` inside a
 *      transaction, so the DROP cascades. The second test pins the observed
 *      behaviour so a future migration that reuses the recipe is caught here
 *      rather than in a stage database.
 */
import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll, describe, expect, it } from "vitest";

interface Column {
  readonly name: string;
  readonly notnull: number;
  readonly dflt_value: string | null;
}

const columns = async (table: string): Promise<ReadonlyArray<Column>> =>
  (await env.DB.prepare(`PRAGMA table_info(\`${table}\`)`).all<Column>())
    .results;

const now = () => Date.now();

/** A user with one session and one account, all through raw statements. */
const seedUserWithSession = async (suffix: string) => {
  const userId = `user-${suffix}`;
  const sessionId = `session-${suffix}`;
  const accountId = `account-${suffix}`;
  await env.DB.batch([
    env.DB.prepare(
      "INSERT INTO `user` (`id`, `name`, `email`, `email_verified`, `role`, `created_at`, `updated_at`) VALUES (?, ?, ?, 1, 'user', ?, ?)",
    ).bind(userId, "Rebuild", `${suffix}@example.com`, now(), now()),
    env.DB.prepare(
      "INSERT INTO `session` (`id`, `expires_at`, `token`, `created_at`, `updated_at`, `user_id`) VALUES (?, ?, ?, ?, ?, ?)",
    ).bind(sessionId, now() + 60_000, `token-${suffix}`, now(), now(), userId),
    env.DB.prepare(
      "INSERT INTO `account` (`id`, `issuer`, `account_id`, `provider_id`, `user_id`, `created_at`, `updated_at`) VALUES (?, ?, ?, ?, ?, ?, ?)",
    ).bind(
      accountId,
      "local:oauth:github",
      `gh-${suffix}`,
      "github",
      userId,
      now(),
      now(),
    ),
  ]);
  return { userId, sessionId, accountId };
};

const countWhere = async (table: string, userId: string): Promise<number> => {
  const row = await env.DB.prepare(
    `SELECT count(*) AS n FROM \`${table}\` WHERE \`user_id\` = ?`,
  )
    .bind(userId)
    .first<{ n: number }>();
  return row?.n ?? 0;
};

/** drizzle-kit's rebuild of `user`, verbatim from the issuer migration. */
const rebuildUser: ReadonlyArray<string> = [
  "PRAGMA foreign_keys=OFF;",
  `CREATE TABLE \`__new_user\` (
	\`id\` text PRIMARY KEY,
	\`name\` text NOT NULL,
	\`email\` text NOT NULL UNIQUE,
	\`email_verified\` integer DEFAULT false NOT NULL,
	\`image\` text,
	\`role\` text DEFAULT 'user' NOT NULL,
	\`created_at\` integer NOT NULL,
	\`updated_at\` integer NOT NULL
);`,
  "INSERT INTO `__new_user`(`id`, `name`, `email`, `email_verified`, `image`, `role`, `created_at`, `updated_at`) SELECT `id`, `name`, `email`, `email_verified`, `image`, `role`, `created_at`, `updated_at` FROM `user`;",
  "DROP TABLE `user`;",
  "ALTER TABLE `__new_user` RENAME TO `user`;",
  "PRAGMA foreign_keys=ON;",
];

describe("migrations on D1 (vitest-pool-workers)", () => {
  beforeAll(async () => {
    // Isolated storage: this file starts from an empty D1.
    const before = await env.DB.prepare(
      "SELECT count(*) AS n FROM sqlite_master WHERE type = 'table'",
    ).first<{ n: number }>();
    expect(before?.n).toBe(0);
    await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
  });

  it("applies the full migration set from an empty database", async () => {
    const applied = await env.DB.prepare(
      "SELECT name FROM d1_migrations ORDER BY id",
    ).all<{ name: string }>();
    expect(applied.results.map((row) => row.name)).toEqual(
      env.TEST_MIGRATIONS.map((migration) => migration.name),
    );
    expect(env.TEST_MIGRATIONS.map((m) => m.name)).toContain(
      "20260903035551_auth_1_7_issuer.sql",
    );

    const tables = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name",
    ).all<{ name: string }>();
    const names = tables.results.map((row) => row.name);
    for (const table of [
      "user",
      "session",
      "account",
      "verification",
      "post",
      "api_keys",
      "workspace",
      "workspace_membership",
    ]) {
      expect(names).toContain(table);
    }
    expect(names.filter((name) => name.startsWith("__new_"))).toEqual([]);

    // The issuer migration landed: NOT NULL, no default, unique with account_id.
    const issuer = (await columns("account")).find((c) => c.name === "issuer");
    expect(issuer).toMatchObject({ notnull: 1, dflt_value: null });
    const indexes = await env.DB.prepare(
      "SELECT name FROM sqlite_master WHERE type = 'index' AND tbl_name = 'account'",
    ).all<{ name: string }>();
    expect(indexes.results.map((row) => row.name)).toContain(
      "account_issuer_accountId_uidx",
    );
  });

  it("enforces foreign keys outside a batch (the baseline the rebuild relies on)", async () => {
    const fk = await env.DB.prepare("PRAGMA foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(fk?.foreign_keys).toBe(1);
    await expect(
      env.DB.prepare(
        "INSERT INTO `session` (`id`, `expires_at`, `token`, `created_at`, `updated_at`, `user_id`) VALUES ('orphan', 1, 'orphan', 1, 1, 'no-such-user')",
      ).run(),
    ).rejects.toThrow(/FOREIGN KEY/);
  });

  it("ignores PRAGMA foreign_keys=OFF inside a migration batch", async () => {
    // Same shape as `applyD1Migrations`: pragma + query in one batch.
    const [, inside] = await env.DB.batch<{ foreign_keys: number }>([
      env.DB.prepare("PRAGMA foreign_keys=OFF"),
      env.DB.prepare("PRAGMA foreign_keys"),
    ]);
    const after = await env.DB.prepare("PRAGMA foreign_keys").first<{
      foreign_keys: number;
    }>();
    expect(inside?.results[0]?.foreign_keys).toBe(1);
    expect(after?.foreign_keys).toBe(1);
  });

  it("drizzle-kit's `user` rebuild under PRAGMA foreign_keys=OFF drops the session row on D1", async () => {
    const { userId } = await seedUserWithSession(crypto.randomUUID());
    expect(await countWhere("session", userId)).toBe(1);
    expect(await countWhere("account", userId)).toBe(1);

    await applyD1Migrations(env.DB, [
      { name: "9999_rebuild_user_test.sql", queries: [...rebuildUser] },
    ]);

    // The user survived the copy...
    const user = await env.DB.prepare("SELECT id FROM `user` WHERE id = ?")
      .bind(userId)
      .first<{ id: string }>();
    expect(user?.id).toBe(userId);
    // ...but `DROP TABLE user` ran with foreign keys ON and cascaded. This is
    // the behaviour the README documents; if D1 ever honours the pragma in a
    // batch, these become 1 and the expand/contract rule can be revisited.
    expect(await countWhere("session", userId)).toBe(0);
    expect(await countWhere("account", userId)).toBe(0);
  });
});
