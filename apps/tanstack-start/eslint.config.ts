import { defineConfig } from "eslint/config";

import { baseConfig, restrictEnvAccess } from "@gmacko/eslint-config/base";
import { reactConfig } from "@gmacko/eslint-config/react";

export default defineConfig(
  {
    ignores: [".nitro/**", ".output/**", ".tanstack/**"],
  },
  baseConfig,
  reactConfig,
  restrictEnvAccess,
);
