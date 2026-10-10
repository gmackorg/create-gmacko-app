# Forge product host

This Worker serves the compiled `forge/` package: posts, customers, and the partner notification.

`pnpm forge:api` refreshes `src/app.json` and `migrations/0001_init.sql` from forgec 0.5.0. Do not edit those two files by hand.

```sh
pnpm -F @gmacko/forge-host dev
```

That applies the local D1 migration and listens on `http://127.0.0.1:8787`. `GET /healthz` is liveness for this process. Product calls are under `/v1`.

`FORGE_AUTH=dev-headers` trusts `x-forge-tenant` and `x-forge-actor`. It is for this scaffold on your machine. A reachable deployment replaces it.

The runtime is the vendored `@forgegraph/runtime` 0.5.0 in `packages/forge-runtime`. It is not published on npm yet.

CRUD resources run on the host. `src/notify.ts` is the one function body the compiler does not derive. It reads the customer and accepts the notice when the event is 1 to 64 characters. A real integration replaces that file.
