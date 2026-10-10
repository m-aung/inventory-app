# Inventory app — Day 1

An online-first iOS inventory app with a Windows-compatible development workflow.
The product name is undecided; **Inventory Dev** is a development placeholder.

## Implemented

- Email/password registration, email confirmation, sign-in/out, reset/change password.
- Dashboard with item name, quantity and unit, availability filters, search and refresh.
- Item creation, details, editing, confirmed deletion, optional notes and input validation.
- One private inventory per verified user, plus multiple shared inventories.
- Owners create/rename/delete shared inventories, invite members by email address, revoke invitations and remove members.
- Recipients accept/decline invitations in the app; members can perform item CRUD and leave.
- PostgreSQL row-level security and RPC authorization; no admin key in the app.
- Version-aware updates and stable item IDs for safe retries.
- Account deletion with password reauthentication and shared-inventory ownership protection.
- Loading/error/empty states, destructive confirmations and unsaved-edit protection.

**Invitation delivery:** Day 1 currently stores email-addressed invitations and displays them in the recipient’s app after verified sign-in. It does not send invitation emails. Choosing/configuring a transactional mail provider is a separate deployment decision. Supabase handles signup/reset emails.

**Not included:** offline editing/sync, OAuth, categories, photos, expiration tracking, scheduling or agent automation. These are Day-2 candidates.

## Run on Windows

Install Node.js 24 LTS and Git, then in PowerShell:

```powershell
git clone https://github.com/m-aung/inventory-app.git
cd inventory-app
npm ci
Copy-Item .env.example .env
```

The project URL and active Supabase **publishable** key are included in the example. Do not put a service-role/secret key in the frontend or commit `.env`.

The backend is already deployed to the supplied Supabase project. Complete the Auth dashboard settings in [the backend setup guide](docs/BACKEND_SETUP.md), then:

```powershell
npm run web
```

This runs the same app UI in a browser for development. Browser testing does not replace iPhone testing.

For a real iPhone development build, follow [the iOS guide](docs/IOS_SETUP.md). No local Mac/Xcode is needed for cloud builds.

## Verify

```powershell
npm run check
npx playwright install chromium
npm run test:e2e
npx expo-doctor
npx expo export --platform ios
npx deno check supabase/functions/delete-account/index.ts
```

`npm test` executes SQL permissions and mutation tests against embedded **PostgreSQL (PGlite)**, plus form and account-deletion handler tests. It does not require a Supabase account or Docker.

Browser tests intercept Supabase HTTP requests with deterministic test fixtures. They exercise real UI/navigation but are not a live-cloud integration test. Before beta release, also run the two-account and iPhone acceptance checks in [TEST_PLAN.md](docs/TEST_PLAN.md).

## Project layout

```text
src/app/                    Expo Router screens and route guards
src/components/             UI primitives, confirmations and feedback
src/features/               Authentication, workspace selection, item editing
src/lib/                    Supabase client, session storage, API, validators
supabase/migrations/        Versioned PostgreSQL schema, RLS policies and RPCs
supabase/functions/         Server-only account deletion endpoint
tests/                      SQL permissions, validation, endpoint and browser tests
docs/                       Scope, architecture, setup and release checklists
.github/workflows/          Automated checks; no automatic production deployment
```

Read [AGENTS.md](AGENTS.md) before changing the project. Keep credentials and production data out of agent prompts and commits.

## Current deployment status

Hosted migrations and the account-deletion function are deployed, and initial SQL/security smoke checks pass. Auth settings, email delivery, EAS setup, Apple provisioning and real-device testing remain required before describing this app as production-ready. See [TEST_RESULTS.md](docs/TEST_RESULTS.md) for verified results and limits.
