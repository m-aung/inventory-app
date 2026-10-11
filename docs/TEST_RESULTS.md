# Verification record

Verified on October 10, 2026, in the development workspace.

| Check                                     | Result                              |
| ----------------------------------------- | ----------------------------------- |
| TypeScript                                | Passed, no errors                   |
| ESLint                                    | Passed                              |
| Vitest                                    | 33 tests across 4 files passed      |
| Browser workflows                         | 11 Chromium tests passed            |
| Expo dependency checks                    | 21 checks passed                    |
| Web production export                     | Passed                              |
| iOS Hermes JavaScript export              | Passed                              |
| Account-deletion Edge Function type check | Passed                              |
| Hosted migrations and Edge Function       | Deployed; function version 1 active |
| Hosted SQL authorization smoke checks     | Passed; temporary data rolled back  |
| Supabase security advisor                 | No findings                         |
| Anonymous REST / invalid-token deletion   | Both rejected with HTTP 401         |

Database tests execute the versioned migration in PGlite PostgreSQL and exercise authenticated and anonymous roles. Browser tests run the real app with mocked Supabase HTTP responses; they do not connect to the hosted project. Session-storage tests cover long Unicode values, failed writes and cleanup. Browser execution in this workspace used Chromium 153 from the official npm package because the Playwright browser download failed; the repository retains the standard Playwright installation workflow for Windows and CI.

The dashboard screenshot in this directory shows the running app with test data.

## Still required before beta release

Authentication/email configuration, two-account integration using real Auth sessions, signed iPhone build, native callbacks and gestures, and TestFlight testing have not been completed. Hosted SQL smoke tests switch database roles with transaction-local test identities; they do not verify registration or email delivery. The performance advisor reports three unused indexes on this new empty database; retain them for the expected membership, inventory-item and invitation queries. An iOS JavaScript export is not a signed native app. Follow TEST_PLAN.md and record real build IDs and outcomes here after those checks.

## Day-1 defect regression verification — October 10, 2026

The quantity decrement now preserves three-decimal precision (including comma input), and restored sessions with missing users/sessions return to sign-in. The session verification error screen also offers a local sign-out action; temporary verification failures retain the session for retry.

- `npm run check`: TypeScript, ESLint and all 33 unit/database tests passed.
- `npm run test:e2e`: all 17 Chromium tests passed, including six new regression cases for fractional decrement/save, missing users/sessions, temporary verification failures and explicit return to sign-in.
- Browser tests use mocked Supabase responses. These results do not establish real-email or real-device acceptance.
- No native dependency/configuration, migration or Edge Function changes in this fix.
