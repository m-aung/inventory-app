# Verification record

## PR verification — October 12, 2026

- PR branch `codex/notebook-sections-ui` starts from current `origin/main`, which already contains the quantity-controls PR. Only the subsequent UI/sections/conflict/flicker changes are proposed here.
- Final `npm run check` passed: TypeScript, ESLint and all 40 unit/database tests.
- Final full Chromium suite passed all 31 scenarios in 3.0 minutes with EXPO_OFFLINE=1, E2E_PORT=8102 and two workers. This includes both flicker regressions and all existing authentication, inventory, quantity, section, conflict and retry workflows.
- Browser tests remain mocked-HTTP verification. Hosted deployment/privilege checks are recorded below; real iPhone and authenticated multi-user acceptance remain pending.

## Approved sections deployment — October 12, 2026

- User explicitly authorized applying the reviewed migration to project `nxjfbnuavolnpziwpbjb` (`inventory-app`, ACTIVE_HEALTHY). Before deployment, only the two original migrations were present and the sections table was absent.
- Supabase `apply_migration` returned success for `notebook_sections`; migration history then showed version `20261012115823`. Renamed the local migration file from `20261012052251_notebook_sections.sql` to `20261012115823_notebook_sections.sql` without changing SQL to align migration identities.
- After aligning the migration filename, `npm run check` passed: TypeScript, ESLint and all 40 unit/database tests. No app/native code changed during this deployment; existing browser results remain recorded separately.
- Hosted schema verification confirmed the new item columns, section RLS/read policy, authenticated SELECT, and no anonymous reads or authenticated base-table INSERT/UPDATE/DELETE. All six new public/private RPC functions grant authenticated execution and deny anonymous/PUBLIC execution; public wrappers are invoker functions and privileged implementations remain private. The migration includes a PostgREST schema-cache reload notification.
- Security advisor reported disabled [leaked-password protection](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection), with no table/RPC advisor findings. No Auth configuration was changed by this deployment.
- Performance advisor reported four [unused-index informational notices](https://supabase.com/docs/guides/database/database-linter?lint=0005_unused_index): membership, invitation, section-order and section-item indexes. Retained them for their intended queries; no maintenance deletion was performed.
- No existing item data was read or manually mutated, and no disposable Auth users were created. Owner/member behavior remains covered by PGlite/browser tests; live authenticated multi-device and iPhone acceptance still require separate evidence. Refresh/reload the development app to fetch the deployed sections schema.

## Sections error flicker — October 12, 2026

- Read-only hosted checks confirmed that only the two original migrations are deployed; `public.inventory_sections` and `public.save_item_with_section` do not exist. No private item data was read and no hosted schema/data was changed.
- Root cause: the missing sections backend causes the request to fail. On initial failures without cached data, TanStack Query resets error/status to pending during each refetch, so a banner based only on `isError` disappears and reappears during polling.
- Fixed locally on `codex/section-error-flicker`: retain section failures through pending refetches until success, skip automatic retries/polling/focus refresh for missing schema/RPC errors, distinguish backend setup problems from temporary refresh failures, and keep a cached section editor mounted through refresh errors.
- `npm run check` passed: TypeScript, ESLint and 40 unit/database tests. Five focused Chromium scenarios passed on port 8101 with two workers: stable missing-backend warning/no automatic retry, notice retained during pending refetch/recovery, section conflict drafts, remote removal fallback and section-only unsaved-change protection. Initial cold-start runs exceeded the original 45-second timeout for the two polling regressions; those scenarios now allow 90 seconds. The final run completed in 53.9 seconds.
- Applying the reviewed notebook sections migration is still required to enable the feature on the hosted backend. This investigation did not deploy it. Real iPhone acceptance of the local warning fix remains pending.

## Notebook sections and shared-edit feedback — October 12, 2026

- Implemented locally on `codex/notebook-sections`: second-row section navigation, full-screen picker, owner-only create/rename/recolor/remove screens, member item assignment, Unsorted/All items and explicit attempted-amount conflict feedback.
- `npm run check` passed: TypeScript, ESLint and all 40 tests across four files. PGlite executes all three migrations, including section isolation/verification, owner/member permissions, base-mutation/anonymous denial, validation, stale assignments/removal, legacy-client compatibility, cascades and request-aware retry detection.
- Final full Chromium run passed all 29 scenarios using EXPO_OFFLINE=1, E2E_PORT=8099 and two workers outside the sandbox. Added section management, member restrictions, failed-save retention, remote structure conflicts, removal fallback, remote reassignment draft preservation, section-only dirty drafts, and response-loss retries. Earlier form failures exposed an empty-string rendering warning whose development overlay blocked buttons; the conditional was corrected before the final passing run.
- Visually inspected the generated `test-results/sections-picker.png` and `test-results/finance-ui-narrow.png` with mocked data. Web production export and iOS Hermes export passed. The initial sandboxed iOS export could not write its temporary bytecode file; the approved rerun outside the sandbox succeeded. An iOS export is not a signed build or real-device acceptance.
- Migration `20261012052251_notebook_sections.sql` is local only. No production database mutation, Edge Function deployment, new native dependency/configuration or signed app distribution occurred. Follow [SECTIONS_DEPLOYMENT.md](SECTIONS_DEPLOYMENT.md) before distributing the new client.
- Database tests use a mock Auth schema; browser tests use mocked HTTP. Live same-account/multi-account sessions, shared-device foreground behavior, keyboard, large text/VoiceOver, signed iPhone/TestFlight and post-deployment advisor checks remain unverified.

## Finance-inspired light UI — October 12, 2026

- Implemented on `codex/finance-ui`: deep-teal record overview, neutral surfaces, a compact inventory picker, connected item rows, grouped decrease/amount/increase controls, and shared pill-shaped buttons. Dark mode remains a preview concept.
- `npm run check` passed: TypeScript, ESLint and 33 unit/database tests. All 22 Chromium browser scenarios passed using EXPO_OFFLINE=1, E2E_PORT=8096 and two workers outside the workspace sandbox after in-sandbox Expo startup stalled.
- Added a 320px browser regression for long item names, large fractional quantities, touch target width, horizontal overflow, and record counts across different units and filters. Visually inspected `test-results/finance-ui-narrow.png` with mocked data.
- No backend, native dependency or native configuration changes. No backend deployment required. Reload a Metro-connected development app; installed standalone builds need a new app build to include this UI.
- Browser tests use mocked Supabase responses; real iPhone font scaling, keyboard and VoiceOver behavior remain unverified for this redesign.

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

## Dashboard quantity controls — October 11, 2026

- `npm run check` passed: TypeScript, ESLint and all 33 unit/database tests.
- Added dashboard +/− and exact-quantity controls and a details “Mark out of stock” action. Changes use the existing version-aware save RPC; no migration, Edge Function or native dependency/configuration changes, and no backend deployment is required. Reload a Metro-connected development app to test; standalone installed builds need a new app build.
- Browser coverage includes fractional decrement to zero, stock filters, exact comma-decimal entry and bounds, preserved item IDs/notes, failed-save retention/retry, rapid-tap protection, maximum quantity, and conflict/reload after background polling.
- All 21 Chromium scenarios passed across a 20-pass full run and a successful rerun of the corrected status-label test. The original assertion matched hidden retained navigation screens; the correction restricts it to visible text. Six-worker startup timed out; successful runs used two workers (one for the targeted rerun), EXPO_OFFLINE=1 and E2E_PORT=8083. The standard Playwright Chromium runtime was installed for this workspace.
- Browser tests use mocked HTTP responses. Live Supabase sharing, real iPhone keyboard/VoiceOver/touch checks and TestFlight acceptance remain separate and unverified for this feature.
- User reported that the updated feature looks good on their phone on October 11, 2026. Build ID and detailed keyboard, VoiceOver, sharing/conflict and TestFlight outcomes were not supplied; this confirms visual acceptance only.
