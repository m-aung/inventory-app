# Architecture

## Boundaries

The Expo app renders screens, validates drafts, stores the session in iOS Keychain via SecureStore, and calls Supabase with a publishable key plus the signed-in user's token. Browser development stores sessions in localStorage; inventory data stays in memory only. There is no offline queue or local item database in Day 1.

TanStack Query owns in-memory server state. Query keys include the signed-in identity and selected inventory. Account changes clear cached queries. Focus/refresh and short polling update shared data; no realtime replication privileges are required.

Supabase Auth owns credentials, email confirmation and recovery. PKCE callbacks exchange a one-time code on the same device/browser that started the flow. No tokens or passwords are logged by app code.

PostgreSQL is the authority for membership and all item writes. SQL functions are small, transaction-scoped backend endpoints rather than a separate Node service. This avoids duplicating authorization while retaining versioned backend code and reproducible SQL tests.

## Tables

| Table             | Purpose                                                  |
| ----------------- | -------------------------------------------------------- |
| inventories       | Owner, private/shared kind, display name                 |
| inventory_members | Non-owner membership in shared inventories               |
| items             | Name, decimal quantity, unit, notes, version, timestamps |
| inventory_invites | Normalized target email, status, 7-day expiry            |

The owner lives on the inventory row. A unique partial index permits one private inventory per user. Members are separate from owners. Read policies use non-recursive security-definer helpers with a fixed empty search path. Helpers resolve the current authenticated identity; none accepts an arbitrary viewer identity.

Base tables grant authenticated users SELECT only. Management writes use explicitly granted RPCs; anonymous/public execution is revoked. Each RPC checks a verified existing account and the required inventory permission. Invite acceptance checks the current verified email from auth.users, not an email supplied by the caller or an old JWT claim. Locks on the inventory serialize membership changes and item writes.

## Mutation correctness

Clients create a UUID once for an add form. A retried create using that same ID succeeds only if the saved payload matches. Edits send the version captured when editing started. The backend updates the matching version, increments it, and rejects stale writes. A lost-response retry of the exact next version/payload returns the existing result. Edits cannot move items to another inventory.

SQL checks mirror frontend quantity/name/unit/notes limits. An unconstrained numeric column with a precision check rejects excessive decimal precision rather than rounding it silently.

## Account deletion

The server-only Edge Function validates the bearer token with `auth.getUser`, reauthenticates the same user with the submitted password, checks owned shared inventories, then calls the Auth admin API. Only the server has a service-role key. A database trigger independently blocks deletion while shared inventories are owned, including a race with concurrent shared-inventory creation. Private data/memberships cascade when the Auth user is removed. Items in someone else's shared inventory remain.

## Extensibility

Day 2 can add offline storage and synchronization behind the existing API layer, preserving item IDs and versions. Additive schema migrations can add category/photo/expiry fields. Jobs and bots should use dedicated server functions and least-privilege database roles; they do not receive a mobile publishable key as admin access, and should not automatically apply production migrations or delete production data.

No agent scheduler, generic automation framework, billing service, or microservice layer is added in Day 1.

## Known operational limits

- Shared updates poll rather than arriving instantly.
- Item lists are fetched in 500-record pages and rendered with FlatList; very large datasets will need server search and cursor pagination. Concurrent changes during multi-page reads converge on the next refresh.
- No automatic invitation emails, realtime subscription, monitoring vendor or production backup policy is configured yet.
- Unit limits and auth policies must remain aligned between UI, SQL and hosted Auth settings.
