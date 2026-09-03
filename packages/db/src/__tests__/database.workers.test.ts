import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

import { Database } from "../database";
import { databaseSuite } from "./database.shared";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

databaseSuite("d1 (vitest-pool-workers)", Database.layer(env.DB));
