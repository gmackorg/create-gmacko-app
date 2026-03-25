# Mobile QA Checklist

Use this checklist before you ship a beta or store build.

- Verify the dev client installs and launches from Expo Orbit.
- Verify the sign-in and auth callback flow works on a real device.
- Verify Sign in with Apple works on iOS and uses the native Apple button.
- Verify the in-app account deletion flow works end to end.
- Verify deep link handling for the configured `EXPO_PUBLIC_APP_DOMAIN`.
- Verify push-notification setup if the app enables notifications.
- Verify staging and production API URLs point at the intended backend.
- Verify a release build succeeds for the store target you plan to submit.
- Verify store metadata, screenshots, privacy links, and support links are current.
