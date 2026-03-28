---
name: test-mobile-with-maestro
description: Use when an Expo or React Native app needs deterministic end-to-end smoke coverage before broader QA or release work - adds Maestro flows around core onboarding, auth, and happy-path product actions instead of relying on manual device testing
---

# Test Mobile With Maestro

Cover the first mobile release path with Maestro before expanding the suite.

Start with:

1. app launch,
2. sign-in or onboarding,
3. one core happy-path action,
4. one recovery/error path, and
5. a documented way to run the flows locally and in CI.

Keep the flows resilient and product-facing rather than snapshot-heavy.
