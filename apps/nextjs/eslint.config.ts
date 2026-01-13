import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@gmacko/eslint-config/base";
import { nextjsConfig } from "@gmacko/eslint-config/nextjs";
import { reactConfig } from "@gmacko/eslint-config/react";

export default defineConfig(
  {
    ignores: [".next/**"],
  },
  baseConfig,
  reactConfig,
  nextjsConfig,
  restrictEnvAccess,
);
