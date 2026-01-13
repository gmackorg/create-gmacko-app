# Changesets

This folder manages the versioning and changelogs for publishable packages in this monorepo.

## Publishable Packages

- `@gmacko/mcp-server` - MCP server for AI assistants
- `@gmacko/trpc-client` - Vanilla tRPC client for external consumers

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
