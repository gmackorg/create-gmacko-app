# Security Policy

## Reporting a Vulnerability

If you discover a security vulnerability, please report it responsibly:

1. **Do NOT** open a public GitHub issue
2. Email security findings to **security@gmacko.dev**
3. Include:
   - Description of the vulnerability
   - Steps to reproduce
   - Potential impact
   - Suggested fix (if any)

We will acknowledge receipt within 48 hours and provide a detailed response
within 5 business days.

## Supported Versions

| Version | Supported |
|---------|-----------|
| Latest  | Yes       |
| < Latest | No — upgrade to latest |

## Security Measures

This template includes the following security measures out of the box:

### Headers & Transport
- **HSTS** on every stage but development (`apps/web/src/server/headers.ts`)
- **Content-Security-Policy** with a per-request nonce on HTML responses; `script-src 'self' 'nonce-…'`
- **X-Frame-Options: DENY** preventing clickjacking
- **X-Content-Type-Options: nosniff** preventing MIME sniffing
- **Referrer-Policy: strict-origin-when-cross-origin**
- **Permissions-Policy** disabling camera, microphone, geolocation

### Authentication
- Session-based auth (better-auth) with secure, httpOnly cookies (`__Secure-` prefixed over https)
- Magic link, OAuth 2.0 for GitHub, Google, and Apple; the Expo plugin for mobile
- API keys (`gmk_…`) hashed with WebCrypto before storage, scoped `read` / `write` / `delete` / `admin`
- Non-GET requests with a session cookie must carry an allowlisted `Origin` or `Sec-Fetch-Site: same-origin`
- Rate limiting on the contact, API-key, and operator endpoints (`RateLimit` annotations)

### Input Validation
- Effect `Schema` validation at the `HttpApi` boundary: params, payload, and responses are decoded from the contract in `packages/domain`; a bad payload is a 400 before any handler runs
- Stripe webhook signature verification (`POST /api/webhooks/stripe`)

### Dependencies
- Automated dependency updates via Renovate
- Lock file integrity checks in CI
- `pnpm check:standards` fails a PR that commits credentials, reads raw `process.env` in the Worker bundle, or creates `.dev.vars`

### API Security
- Every endpoint declares its credential in the contract: public, `Session`, or `SessionOrKey(scope)`; role checks (`AdminOnly`, `WorkspaceRole(min)`) read the database on every request, never the cookie cache. The generated matrix is `docs/API_AUTH.md`.
- Account deletion and bootstrap completion accept a session only; a leaked API key cannot reach them
- CORS trusted origins configured per stage (`ALLOWED_ORIGINS`)
- `x-request-id` and `x-trace-id` on every API response for audit trails
- Health endpoints return generic responses outside development
