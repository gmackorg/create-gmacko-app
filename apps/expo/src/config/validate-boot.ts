// Side-effect module: validates the environment at boot. Kept separate from the
// entry so that importing it (and thus running validateEnvironment) is
// guaranteed by ESM to complete BEFORE `expo-router/entry` evaluates — a plain
// `validateEnvironment()` call in index.ts would run AFTER the hoisted
// `import "expo-router/entry"`, i.e. after the app already started.
import { env } from "./env";
import { validateEnvironment } from "./env-validation";

validateEnvironment(env);
