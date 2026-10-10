# Forgejo CI

CI runs only from `.forgejo/workflows` on Forgejo runners. GitHub mirrors distribute source and have no active GitHub Actions workflows.

Action code is fetched from `https://git.forgegraf.com/gmackie/ci-actions` at an immutable commit. The snapshot repository records original revisions and retains upstream licenses. Its `forgec-v0.5.0` release hosts the compiler archive; the workflow verifies its SHA256 before installation. Track snapshot updates in ForgeGraph (FORGE-55) and update consumer pins deliberately.

Preview comments, version PRs, and SDK release assets use Forgejo's `/api/v1` through `scripts/ci/forgejo.mjs`. The runner's `github.*` context is Forgejo's compatibility alias: `github.server_url` and `github.token` refer to this Forgejo installation and its job token, not GitHub. Package publication still targets the configured package registries; toolchain installers use their upstream distribution services.

The release workflow prepares a `changeset-release/main` PR when changesets exist. Otherwise it runs the package publication command. Vendored ForgeGraph snapshots are private and cannot be published by this template.
