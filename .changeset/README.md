# Changesets

This folder manages the versioning and changelogs for publishable packages in this monorepo.

## Publishable Packages

Only one package is published to npm:

- `create-gmacko-app` - the scaffolder CLI

Every other package is `private` and never published. `changeset version`
still bumps and tags them (`privatePackages` in `config.json`), so add a
changeset when one of these changes in a way a consumer should see:

- `@gmacko/api-client` - the typed API client (`effect/unstable/httpapi`
  over `@gmacko/domain`) and its TanStack Query layer, used by the web app,
  Expo, the operator CLI and the MCP server
- `@gmacko/api-cli` - the operator CLI
- `@gmacko/mcp-server` - MCP server for AI assistants

## Usage

### Adding a Changeset

When you make changes to a publishable package, run:

```bash
pnpm changeset
```

This will prompt you to:

1. Select which packages have changed
2. Choose the type of version bump (major, minor, patch)
3. Write a summary of the changes

### Versioning

To apply changesets and update package versions:

```bash
pnpm changeset version
```

This will:

- Update package versions based on changesets
- Update CHANGELOG.md files
- Remove applied changeset files

### Publishing

To publish packages to npm:

```bash
pnpm changeset publish
```

## CI/CD

The release workflow automatically:

1. Creates a "Version Packages" PR when changesets are present
2. Publishes packages when the PR is merged
