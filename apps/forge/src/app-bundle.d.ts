declare module "*.json" {
  const bundle: import("@forgegraph/runtime").AppBundle;
  export default bundle;
}
