# DJ Sally Accounts, Vercel Sandbox, and AI Gateway

This project now has a first-pass account pattern for turning DJ Sally from a single local controller dashboard into a per-user setup service.

## What is implemented

- A package-style internal library at `packages/dj-sally-vercel-control`.
- A signed account session cookie for hackathon/demo auth.
- Per-user setup defaults for HID mapping, AI Gateway model routing, and Sandbox limits.
- Account API routes:
  - `GET /api/account`
  - `POST /api/account`
  - `DELETE /api/account`
  - `PATCH /api/account/setup`
  - `POST /api/account/ai-plan`
  - `POST /api/account/sandbox`
- A dashboard account panel where a user can create a session, request an AI Gateway setup plan, and prepare a Vercel Sandbox launch plan.

## Current auth pattern

The current implementation uses a signed, HTTP-only cookie:

1. A user enters a display name and optional email.
2. The server creates a `DjSallyUserAccount`.
3. The server signs the session using `DJ_SALLY_SESSION_SECRET`.
4. Browser code only sees account metadata returned by `/api/account`; the signature and secret stay server-side.

This is appropriate for the hackathon demo because it creates an isolated per-browser account without adding a database or third-party auth provider. For production, replace the cookie-only account source with OAuth plus durable storage.

Production upgrade path:

- Use Vercel Marketplace / Storage with Postgres, Neon, Supabase, or another durable database.
- Use Auth.js, Clerk, or another OAuth provider for identity.
- Store `DjSallyUserAccount.setup` in the database keyed by the authenticated user id.
- Keep the `@hey-salad/dj-sally-vercel-control` package as the shared account/setup contract.

## AI Gateway pattern

The AI setup route uses the Vercel AI SDK through `@ai-sdk/gateway`:

- Model selection is per account: `account.setup.aiGateway.model`.
- Requests are tagged with `dj-sally` and `account-setup`.
- `quotaEntityId` is set to the account id so usage can be attributed per user.
- `zeroDataRetention` follows the user's setup.

Relevant docs:

- AI Gateway capabilities: `https://vercel.com/docs/ai-gateway/capabilities`
- Models and providers: `https://vercel.com/docs/ai-gateway/models-and-providers`
- Provider options, including request-scoped BYOK and Gateway options: `https://vercel.com/docs/ai-gateway/provider-options`
- SDKs and APIs: `https://vercel.com/docs/ai-gateway/sdks-and-apis`

## Sandbox pattern

The sandbox route builds a per-user `SandboxLaunchPlan` from the account setup. Live sandbox creation is intentionally disabled unless:

```bash
DJ_SALLY_ENABLE_SANDBOX_CREATE=1
```

This keeps the public demo from creating paid compute for arbitrary visitors. When enabled, the server route creates a Vercel Sandbox with:

- per-user account id in env
- selected runtime (`node24`, `node22`, or `python3.13`)
- timeout and vCPU limits from account setup
- no client-side Vercel tokens

Vercel Sandbox uses project-linked Vercel credentials/OIDC server-side. Do not expose sandbox credentials or Vercel tokens to the browser.

Relevant docs:

- Sandbox docs: `https://vercel.com/docs/vercel-sandbox`
- SDK reference: `https://vercel.com/docs/vercel-sandbox/sdk-reference`
- Running commands in a sandbox: `https://vercel.com/docs/vercel-sandbox/run-commands-in-sandbox`
- Sandbox examples: `https://vercel.com/docs/vercel-sandbox/examples`

## NPM library direction

The internal package is intentionally shaped like an NPM package:

```text
packages/dj-sally-vercel-control/
  package.json
  src/
    account.ts
    gateway.ts
    sandbox.ts
    session.ts
    types.ts
```

Its job is to become the reusable control surface between:

- DJ Sally dashboard accounts
- HID setup profiles
- Vercel AI Gateway routing
- Vercel Sandbox launch policy
- future Vercel dashboard/API integrations

When this is ready to publish, remove `"private": true`, add build output, and export compiled JS plus declaration files.

## Environment variables

Required for production-grade auth:

```bash
DJ_SALLY_SESSION_SECRET=long-random-secret
```

Optional:

```bash
DJ_SALLY_ENABLE_SANDBOX_CREATE=1
```

Existing Sally device secrets should remain server-only:

```bash
SALLY_ADMIN_TOKEN=...
SALLY_REMOTE_CONTROL_URL=...
SALLY_DEVICE_ID=...
```
