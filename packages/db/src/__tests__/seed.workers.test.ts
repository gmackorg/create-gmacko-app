import { applyD1Migrations } from "cloudflare:test";
import { env } from "cloudflare:workers";
import { beforeAll } from "vitest";

import { Database } from "../database";
import { seedSuite } from "./seed.shared";

beforeAll(async () => {
  await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);
});

seedSuite("d1 (vitest-pool-workers)", Database.layer(env.DB));
