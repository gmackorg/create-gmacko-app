# Fault injection (`pnpm test:fault`)

The fourth test lane. The other three answer "does the code do the right
thing?"; this one answers "does it still do the right thing when the
infrastructure misbehaves in a way it is *documented* to misbehave?"

| Lane | Command | What it runs on | What it proves |
| --- | --- | --- | --- |
| Unit | `pnpm test` | node, in-memory SQLite (`layerTest`) | handlers, services, schemas |
| Workers | `pnpm test:workers` | workerd + Miniflare D1 | the D1-only behaviour (guarded writes, batches, cascades) |
| Browser | `pnpm e2e:web` | Playwright against `vite dev` | what a user can actually do |
| **Fault** | **`pnpm test:fault`** | **workerd + Miniflare D1 + CloudFault** | **invariants under systematic perturbation** |

It is powered by [CloudFault](https://github.com/gmackie/cloudfault)
(`@gmacko/cloudfault`) — Jepsen-style histories, three-valued outcomes, and
delta-debugged minimal failure sets, for Cloudflare Workers.

## Why a fourth lane

Unit tests call a handler once. That structurally cannot reach the class of
bug that shows up *between* attempts:

- a provider that delivers the same event twice (Stripe documents webhooks as
  at-least-once);
- a write that **commits** while the caller is told it did not — the
  `INDETERMINATE` outcome, which is neither success nor failure and which
  every naive retry gets wrong;
- two legal-but-unlucky behaviours that are each harmless alone and broken
  together.

The lane exists because the last one is real here: the Stripe webhook ledger
was correct against duplicate delivery alone, and correct against a lost
ledger write alone, and wrong when both happened. Depth-2 search found it.

## Running it

```bash
pnpm test:fault                      # depth 1 (what CI runs on every PR)
CLOUDFAULT_DEPTH=3 pnpm test:fault   # every pair and triple
```

Depth is the whole cost knob. Depth 1 tries each perturbation on its own;
depth *n* tries every combination of *n* fault points. Scenario count grows
combinatorially, and a failure then costs one extra run per perturbation the
minimiser tries to remove.

Today the two scenarios take ~150 ms of actual search at any depth — the
wall clock is workerd startup. CI budgets 10 minutes for the depth-1 PR job
and 45 for the nightly depth-3 one; that headroom is for the scenarios that
have not been written yet, not for these.

### Installing `@gmacko/cloudfault`

**`@gmacko/cloudfault` is not published to npm yet, so this lane does not run
on a clean checkout, and a freshly scaffolded app cannot install it.** Until
`0.1.0` is on npm, `pnpm test:fault` prints what is missing and exits 0.

Once it is published:

```bash
pnpm -F @gmacko/web add -D @gmacko/cloudfault@^0.1.0
```

and then, in that same commit:

1. delete `apps/web/tsconfig.fault.json` and drop `"fault"` from
   `apps/web/tsconfig.json`'s `exclude`, so `pnpm typecheck` covers the lane;
2. drop the `ignoreDependencies` entry for it in `knip.json`;
3. set `CLOUDFAULT_REQUIRED: 1` in `.github/workflows/ci.yml` and
   `.github/workflows/fault.yml`, so a lane that cannot run is a red build
   rather than a silent skip;
4. delete the `CLOUDFAULT_SRC` branch of `apps/web/fault/run.mjs`.

Until then, for local work, either install a packed tarball
(`pnpm -F @gmacko/web add -D ./gmacko-cloudfault-0.1.0.tgz`) or point the lane
at a built checkout:

```bash
CLOUDFAULT_SRC=/path/to/cloudfault pnpm test:fault
```

`apps/web/fault/run.mjs` then writes a facade with the published subpath
layout into `node_modules/@gmacko/cloudfault`, so import specifiers in
`fault/` are the published ones either way.

## Layout

```
apps/web/fault/
  run.mjs                    the lane's entry point (resolution + vitest)
  workers-env.d.ts           bindings vitest.fault.config.ts adds
  stripe-webhook.fault.ts    a scenario: at-least-once webhook delivery
  signup-rate-limit.fault.ts a scenario: the D1 counter fails, sign-up must not
  helpers/
    cloudfault.ts            every @gmacko/cloudfault import in the repo
    explore.ts               the search driver and its safety checks
    ledger.ts                the webhook ledger over a proxied env.DB
    perturbations.ts         fault records this repo declares
    stripe.ts                signed delivery fixtures
```

Scenarios sit beside the Worker they perturb, the way `apps/web/e2e/` sits
beside the app it drives. `apps/web/vitest.fault.config.ts` runs them on
`@cloudflare/vitest-pool-workers` so `env.DB` is a real D1 binding — which is
what CloudFault's `createD1FaultProxy` needs to wrap.

## Reading a minimal failure set

A failing run prints one report. Here is the one that motivated the lane,
against the webhook handler before it deduped:

```
CloudFault failure — stripe-webhook/at-least-once-delivery
Scenario: stripe:webhook.delivery:webhook-duplicate

Checks:
FAIL stripe-webhook-effect-at-most-once — Event evt_cloudfault_1 was applied 2 times
     across 2 deliveries; Stripe delivers at least once, so the effect must be idempotent.
PASS stripe-webhook-ack-implies-effect

Minimal Failure Set:
  - stripe:webhook.delivery:webhook-duplicate: Stripe delivers the same event more
    than once (at-least-once delivery)

Timeline:
0000 +0.000ms  invoke  stripe  stripe.webhook.delivery(event:evt_cloudfault_1)
0001 +0.000ms  fault   nemesis stripe.webhook.delivery(...) [stripe:webhook.delivery:webhook-duplicate]
0002 +0.000ms  info    stripe  stripe.webhook.delivery(...) actual=committed observed=success
0003 +1.000ms  invoke  worker  app.handleStripeWebhook(event:evt_cloudfault_1)
0004 +1.000ms  ok      worker  app.handleStripeWebhook(...) actual=committed observed=success
0005 +1.000ms  invoke  worker  app.handleStripeWebhook(event:evt_cloudfault_1)
0006 +1.000ms  ok      worker  app.handleStripeWebhook(...) actual=committed observed=success
```

Read it in this order:

1. **Checks** — which invariant broke, in its own words. Write the message so
   it names the number that is wrong, not "assertion failed".
2. **Minimal Failure Set** — *the actionable part*. Not the scenario that
   failed: the smallest subset of it that still fails, found by removing
   perturbations one at a time and re-running. One entry means one thing has
   to be true for the bug to appear. Two entries mean neither alone is
   enough — you are looking at an interaction, and fixing either one fixes
   the bug.
3. **Timeline** — the Jepsen history. `invoke`/`ok`/`fail`/`info` per
   operation, plus `fault` rows where a perturbation activated. The column
   that matters is `actual=… observed=…`:

   | `actual` | `observed` | meaning |
   | --- | --- | --- |
   | `committed` | `success` | the write landed and the caller knows |
   | `not-committed` | `definite-failure` | it did not land, and the caller knows |
   | `committed` | `indeterminate` | **it landed and the caller does not know** |

   The third row is what this lane is for. A `fail` row is a bug you can
   retry your way out of; an `info` row with `actual=committed` is not.

An empty minimal failure set (`(none)`) means the *baseline* — no
perturbations at all — already fails. That is an ordinary bug; fix it before
reading anything else into the search.

## Adding an invariant

An invariant is a predicate over the run's final state and its history:

```ts
invariant<WebhookState>(
  "stripe-webhook-effect-at-most-once",
  ({ state }) => new Set(state.applied).size === state.applied.length,
  ({ state }) =>
    `Event was applied ${state.applied.length} times across ${state.deliveries} deliveries`,
);
```

Three rules that make one worth having:

- **State it as a property of the system, not of the code.** "The effect runs
  at most once per event id" survives a refactor; "claim() returns duplicate"
  does not.
- **Make the message name the wrong number.** You will read it from a CI log
  with no context.
- **Prefer at-most-once and ack-implies-effect over exactly-once.** Exactly
  once is not achievable across a boundary you do not control; claiming it in
  an invariant means the lane will be red forever or the invariant is lying.

## Adding a scenario

Add `apps/web/fault/<name>.fault.ts` with four parts:

1. **A workload** — `execute(scenario)` runs the thing once under that
   scenario and returns `{ scenario, history, checks, state, durationMs }`.
   Drive the real code: the HTTP handler, the real service over
   `Database.layer(...)`. `helpers/ledger.ts` shows the pattern —
   `createD1FaultProxy(env.DB, { controller })` wraps the binding, and
   nothing in `src/` or `packages/` knows it is being perturbed.
2. **Fault points** — a named choice set per thing that can go wrong:
   `{ id, target, choices: [fault, otherFault] }`. The search takes at most
   one choice per point.
3. **Invariants** — see above, run through `runCheckers`.
4. **The assertions** — `explore({ name, faultPoints, execute })`, then
   `assertActivated(result, faultPoints)`.

`assertActivated` is not optional. A perturbation whose selector matches
nothing never fires, every invariant holds, and the lane reports success
while testing nothing — that is the single most likely way for this lane to
lie, and it happened during its own development. Select D1 faults by
**target**, not by operation name: drizzle's Effect driver executes through
`@effect/sql`'s `executeValues`, so the terminal is `.raw()`, not `.run()`.

## What the lane cannot express yet

Stated so nobody reads a green run as more than it is:

- **`Database.batch([...])` is unperturbed.** `@effect/sql-d1` implements it
  with `db.batch()`, and CloudFault's D1 proxy interposes on
  `prepare().bind().first/all/run/raw` only. So the app's atomic writes —
  `acceptInvite`, `completeBootstrap`, `reviewWaitlistEntry`,
  `deleteAccount`'s cascade — cannot currently be given a mid-batch fault.
  This is the biggest gap.
- **No privileged oracle.** CloudFault infers `actual=committed` from "the
  call returned before we cut the wire". That is sound for the
  commit-then-timeout faults used here, because CloudFault chose the moment,
  and unsound for a fault injected *inside* the backend (a partially applied
  batch). When `@gmacko/emulate` grows a Cloudflare D1 emulator it can answer
  "did it land" directly; `helpers/ledger.ts` is where that would plug in.
- **Concurrency is recorded, not scheduled.** CloudFault runs logical clients
  as async sequences and records the interleaving that happened; it does not
  enumerate interleavings. Two-writer races are covered by ordinary tests
  (`admin.workers.test.ts`), not here.
- **Single-event workloads.** `webhook-reorder` and `webhook-delay` need a
  workload with more than one event to mean anything.
