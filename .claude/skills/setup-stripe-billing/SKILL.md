---
name: setup-stripe-billing
description: Use when a SaaS app needs Stripe products, prices, subscriptions, and webhook-backed billing after the core product shape is known - keeps the work focused on the minimal viable billing model and the operational checks needed to ship it safely
---

# Setup Stripe Billing

Scope the first Stripe integration to:

1. products and prices,
2. subscription creation and status sync,
3. webhook handling and idempotency,
4. local and staging verification, and
5. user-facing billing states.

Start with one clear plan before expanding into coupons, seats, or complex billing logic.
