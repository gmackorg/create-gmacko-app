// Learn more: https://docs.expo.dev/guides/monorepos/
const path = require("node:path");
const { getDefaultConfig } = require("expo/metro-config");
const { FileStore } = require("metro-cache");
const { withNativewind } = require("nativewind/metro");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

const config = getDefaultConfig(projectRoot);

// Monorepo-aware resolution: watch the repo root and resolve from both the
// app's and the root's node_modules so workspace packages (@app/*) resolve.
// Without this, Metro fails with "Unable to resolve @app/config" and the
// dev-client renders a blank screen.
config.watchFolders = [monorepoRoot];
config.resolver.nodeModulesPaths = [
  path.join(projectRoot, "node_modules"),
  path.join(monorepoRoot, "node_modules"),
];
config.resolver.disableHierarchicalLookup = true;
config.resolver.unstable_enableSymlinks = true;

config.cacheStores = [
  new FileStore({
    root: path.join(projectRoot, "node_modules", ".cache", "metro"),
  }),
];

/** @type {import('expo/metro-config').MetroConfig} */
module.exports = withNativewind(config);
