# @gmacko/realtime

Redis pub/sub and BullMQ queues over `ioredis`.

**Node-only. Not supported on the web lane.** `apps/web` runs on Cloudflare
Workers, where there is no TCP socket for `ioredis` and no long-lived process
for a BullMQ worker; this package is not in the Worker's dependency graph and
must not be added to it (`pnpm check:standards --graph` lists that graph, and
the `no-raw-process-env` rule would fail on `REDIS_URL` if it were). The
scaffolder leaves the `realtime` integration off by default and prunes the
package when it is not selected.

Where it still applies: a Node service deployed through ForgeGraph on a VPS
node (a queue consumer, a bot) that owns its own Redis. The web app talks to
such a service over HTTP, never by importing this package.

Configuration: `initRedis({ url })` / `REDIS_URL` from the Node process's
validated env (this package is exempt from the Worker-bundle env rule).
