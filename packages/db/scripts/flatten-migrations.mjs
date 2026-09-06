#!/usr/bin/env node
/**
 * drizzle-kit 1.0 writes one folder per migration
 * (`drizzle/<timestamp>_<slug>/{migration.sql,snapshot.json}`), while
 * `wrangler d1 migrations apply` and `readD1Migrations` want flat
 * `<name>.sql` files. This copies each migration.sql to
 * `migrations/<timestamp>_<slug>.sql`, and removes flat files whose drizzle
 * folder is gone (a dropped or squashed migration). Both directories are
 * committed: `drizzle/` is drizzle-kit's source of truth (snapshots for
 * diffing), `migrations/` is what D1 applies.
 */
import {
  copyFileSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  unlinkSync,
} from "node:fs";
import { join } from "node:path";

const root = new URL("..", import.meta.url).pathname;
const source = join(root, "drizzle");
const target = join(root, "migrations");

mkdirSync(target, { recursive: true });

const folders = readdirSync(source)
  .filter((name) => statSync(join(source, name)).isDirectory())
  .sort();

let written = 0;
for (const name of folders) {
  const from = join(source, name, "migration.sql");
  const to = join(target, `${name}.sql`);
  let unchanged = false;
  try {
    unchanged = readFileSync(from, "utf8") === readFileSync(to, "utf8");
  } catch {
    unchanged = false;
  }
  if (unchanged) continue;
  copyFileSync(from, to);
  written += 1;
  // oxlint-disable-next-line no-console -- build script output
  console.log(`migrations/${name}.sql`);
}
let removed = 0;
const expected = new Set(folders.map((name) => `${name}.sql`));
for (const name of readdirSync(target)) {
  if (!name.endsWith(".sql") || expected.has(name)) continue;
  unlinkSync(join(target, name));
  removed += 1;
  // oxlint-disable-next-line no-console -- build script output
  console.log(`removed migrations/${name} (no drizzle/${name.slice(0, -4)})`);
}
// oxlint-disable-next-line no-console -- build script output
console.log(
  `flattened ${folders.length} migration(s), ${written} updated, ${removed} removed`,
);
