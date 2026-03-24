# Cloudflare Deployment Notes

Use this path when you intentionally want a Workers deployment lane instead of the default ForgeGraph + Nix path.

## Support Matrix

- Preferred owned-infra path: ForgeGraph + Nix + colocated Postgres
- Preferred Workers-native path: TanStack Start on Cloudflare Workers
- Experimental Next.js-on-Workers path: `vinext`
- Adapter-based Next.js Workers path: possible, but less attractive than the two options above

## Recommended Choices

Choose TanStack Start when:

- Cloudflare Workers is the primary runtime
- you want the cleanest current Workers integration
- you do not need strict Next.js compatibility

Choose `vinext` when:

- you want a Next-like app model on Cloudflare Workers
- you are comfortable with an experimental stack
- you want to keep the Next.js mental model while moving to a Vite/Workers runtime

Stay on ForgeGraph when:

- the product should run on the Hetzner VPS
- you want Nix-controlled builds and owned deployment infrastructure
- colocated Postgres is still the right operational tradeoff

## Important Constraint

Do not try to make one runtime contract cover both ForgeGraph/Nix and Cloudflare Workers equally well. Treat them as separate deployment lanes with separate operational assumptions.
