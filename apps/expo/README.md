# Expo Development

Use development builds as the default mobile workflow for this app.

## Recommended Setup

1. Install Expo Orbit for simulator and device management.
2. Build a development client with `pnpm --filter @gmacko/expo build:device:ios` or `pnpm --filter @gmacko/expo build:device:android`.
3. Start the app with `pnpm --filter @gmacko/expo dev:client`.

Expo Go is useful for quick checks, but the long-term default for product work should be a development build.
