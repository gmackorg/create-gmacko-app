// Cloudflare entry for the product API. The .forge package is the source.
// pnpm forge:api refreshes src/app.json from that package.
import { createWorker, type WorkerEnv } from "@forgegraph/runtime/cloudflare";

import bundle from "./app.json";
import { notifyPartner } from "./notify";

const forge = createWorker(bundle, { functions: [notifyPartner] });

export default {
  fetch(
    request: Request,
    env: WorkerEnv,
    ctx: { waitUntil(promise: Promise<unknown>): void },
  ): Promise<Response> {
    // Liveness for local dev and the browser suite. Not a Forge operation.
    if (new URL(request.url).pathname === "/healthz") {
      return Promise.resolve(new Response("ok"));
    }
    return forge.fetch(request, env, ctx);
  },
  scheduled: forge.scheduled,
};
