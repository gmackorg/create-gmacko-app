# anti-slop (vendored)

Opinionated oxlint rules that reject low-evidence, low-signal TypeScript — the
class of code that type-checks cleanly but carries no evidence: `unknown`
parameters, `Record<string, unknown>` dictionaries, unjustified `as`
assertions, module mocking instead of real seams.

Upstream: <https://github.com/dmmulroy/anti-slop> (MIT, see `LICENSE`).

| | |
| --- | --- |
| Vendored commit | `e8c4880471b23ab7f216fba7b27d173a6ef07d4c` |
| Vendored on | 2026-09-03 |
| Upstream path | `src/` → this directory |

Upstream is explicitly **meant to be vendored**, not consumed from npm: there
is no published package. This directory is a verbatim copy of upstream `src/`
plus this README. Do not edit the rules in place — a local edit is invisible in
a re-sync diff. If a rule is wrong for this repo, turn that rule off in
`oxlint.config.ts` with a written reason instead.

## How it is wired up

`oxlint.config.ts` at the repo root registers both plugin groups:

- `anti-slop` — the generic rules, all enabled.
- `anti-slop-effect` — Effect service/Layer architecture rules. Enabled
  because `apps/web`, `packages/api`, `packages/db` and `packages/domain` are
  Effect 4.

`pnpm lint:ox` (and therefore CI and the lefthook pre-commit hook) runs them.
This directory is in `ignorePatterns` — it is upstream source, linted upstream.

`no-shape-in-symbol-names` is deliberately **off**; see the reason in
`oxlint.config.ts`.

## Version lockstep

oxlint loads a JS plugin into its own process, so `@oxlint/plugins` must be
**exactly** the resolved `oxlint` version. Both are pinned exact in the
`pnpm-workspace.yaml` catalog (`1.56.0`). Bump them in the same commit, never
one alone.

## Re-syncing

```sh
git clone --depth 1 https://github.com/dmmulroy/anti-slop /tmp/anti-slop
cd /tmp/anti-slop && git rev-parse HEAD   # record this in the table above

cd <repo>
rm -rf tools/oxlint/anti-slop/{index.ts,effect,rules,shared}
cp -R /tmp/anti-slop/src/. tools/oxlint/anti-slop/
cp /tmp/anti-slop/LICENSE tools/oxlint/anti-slop/LICENSE
# then update the commit + date in the table above
pnpm lint:ox
```

Upstream's own `pnpm check` runs each rule's `*.test.ts` (co-located here) via
`tsx` and `RuleTester` from `oxlint/plugins-dev`. Those tests are kept for
re-sync verification; they are not part of `pnpm test`.

Upstream tracks a newer oxlint than this repo. If a re-sync lands rules that
use APIs newer than the pinned `@oxlint/plugins`, bump both oxlint packages
together rather than patching the vendored source.

## Suppression convention

Default to fixing the code. When a suppression is genuinely correct:

- `require-safety-comment-for-type-assertion` takes its own marker comment —
  `// SAFETY: <the invariant that makes this assertion sound>` immediately
  above the assertion. State the invariant; "cast needed" is not one.
- For every other rule, a `// oxlint-disable-next-line anti-slop/<rule>` must
  be followed by a comment saying why the smell is not a smell here.

A bare disable with no stated invariant is a review defect.
