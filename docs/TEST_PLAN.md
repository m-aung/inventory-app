# Acceptance and release checks

## Automated checks

Run `npm run check`, `npm run test:e2e`, `npx expo-doctor`, `npm run build:web`, `npx expo export --platform ios`, and `npx deno check supabase/functions/delete-account/index.ts`.

SQL tests run the actual migration in embedded PostgreSQL and switch to the authenticated/anonymous roles. They check RLS isolation, verified identity, mutation permissions, invite ownership/expiry/revocation, precision constraints, idempotency, conflicts and account deletion protection. The test auth.users schema/uid function are fixtures; Supabase Auth itself is not emulated.

Browser tests use HTTP fixtures for deterministic UI/navigation checks. They cover sign-in, CRUD, filters, validation, failed-save retention/retry, dirty-form navigation, stale versions, shared management, load retry, route protection and account-deletion confirmation.

## Cloud integration (requires configured Supabase)

- User A registers, confirms email and signs in. Private inventory is created exactly once.
- User B registers/confirms; B cannot read/write A's private inventory even with A's inventory/item UUID.
- A creates Family, invites B's verified email. B sees the invitation before joining but cannot see Family's items until acceptance.
- B accepts, reads/creates/edits/deletes shared items. B cannot invite/remove others, rename or delete Family.
- A and B open one item. A saves; B's stale save fails and retains B's draft until explicit reload.
- A removes B. B's next server request loses access. Refreshing removes Family from B's picker.
- Revoke/expire/decline invitations; confirm they cannot be accepted.
- Signup/reset emails arrive, callback works on the originating iPhone and browser, expired links give a recovery action.
- Change password checks current password; old password no longer signs in.
- Delete a disposable account. Incorrect password fails. Owned shared inventory blocks deletion. After explicit shared deletion, account deletion clears private records and membership; others' shared items remain.
- Test the Edge Function with invalid/no bearer tokens and an unapproved web Origin; no deletion occurs.

## Real iPhone

- Development build installs and launches from Windows-hosted Metro.
- All screens fit safe areas; scrolling and keyboards do not cover fields/buttons.
- Session survives app restart; sign-out clears it; another account sees no old inventory.
- Native email callbacks complete signup/recovery; verify links with the app closed and open.
- iOS back swipe triggers draft confirmation; cancel preserves text.
- Airplane mode causes a request error, not a queued write or fake success; reconnect and retry safely.
- Large text, VoiceOver labels, contrast, touch targets and destructive confirmations work.
- Background/foreground refreshes shared data and auth; revoked users lose server access.
- TestFlight build behaves the same without a Metro server.

Record dates, build IDs, test accounts (no passwords/tokens), failures and fixes. Do not mark cloud/device checks passed based on local tests.
