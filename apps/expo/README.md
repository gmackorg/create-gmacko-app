# Expo Development

Use development builds as the default mobile workflow for this app.

## Recommended Setup

1. Install Expo Orbit for simulator and device management.
2. Build a development client with `pnpm --filter @gmacko/expo build:device:ios` or `pnpm --filter @gmacko/expo build:device:android`.
3. Start the app with `pnpm --filter @gmacko/expo dev:client`.

Expo Go is useful for quick checks, but the long-term default for product work should be a development build.

## Release Readiness

- Set `EXPO_PUBLIC_APP_DOMAIN` before you configure associated domains and deep-link verification.
- Replace the scaffold bundle identifier values in `app.config.ts` before store submission.
- Configure Sign in with Apple credentials before shipping iOS builds with social login.
- Verify the in-app account deletion flow on a real device before App Store submission.
- Keep staging and production API URLs explicit so the dev client, beta builds, and store builds do not drift.
- Run `pnpm --filter @gmacko/expo check:app-store` and clear every placeholder before a release candidate.
- Work through the [mobile QA checklist](./docs/mobile-qa.md) before shipping a release candidate.
