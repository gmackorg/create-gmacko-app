import { defineConfig } from "eslint/config";

import { baseConfig } from "@gmacko/eslint-config/base";
import { reactConfig } from "@gmacko/eslint-config/react";

export default defineConfig(
  {
    ignores: ["dist/**"],
  },
  baseConfig,
  reactConfig,
);
