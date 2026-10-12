# Notebook sections deployment

The client was implemented on `codex/notebook-sections`. With the user's explicit approval, the reviewed migration was deployed October 12, 2026 to the `inventory-app` Supabase project (`nxjfbnuavolnpziwpbjb`). No signed app was distributed.

Supabase recorded version `20261012115823` with name `notebook_sections`. The local file was renamed from `20261012052251_notebook_sections.sql` to `20261012115823_notebook_sections.sql`, preserving its SQL, so future CLI deployments do not treat it as a second pending migration. RLS and RPC privilege checks passed; live multi-device/iPhone acceptance remains pending.

## Backend before client

For another environment, review `supabase/migrations/20261012115823_notebook_sections.sql` and apply it through the project's deliberate backend deployment process after confirming the target project and backup/recovery plan. Both earlier migrations must already be present. Do not reapply it to the already migrated project. Never run a database reset against a hosted project to deploy this change.

The migration adds inventory-owned sections and nullable item assignments. Existing items remain Unsorted. It uses authenticated invoker RPC wrappers around private implementations, verified-user/owner checks, read RLS, and no client base-table mutation grants. Shared members can assign items but only owners manage section structure. Item/section writes lock their parent inventory so removal, assignment and membership changes have a consistent order.

Removing a section first moves its items to Unsorted and increments their versions, then removes the section. Item IDs, amounts, units and notes are preserved. Old installed clients continue to use `save_item`, which retains an existing assignment. New clients use `save_item_with_section` and request identifiers for exact retry detection; legacy clients retain the original payload/version retry semantics. No Edge Function deployment or native dependency/config change is needed.

Deploy this migration before making the new client available. Without it, section queries and new item saves cannot succeed; the UI reports failures and retains drafts. Refresh the Supabase API schema cache if the new RPCs are not visible, using the project's documented backend procedure. Check Data API access/RLS/function execution privileges and run the existing backend advisor checks after deployment.

## Verify with disposable data

1. Sign into a disposable account on two devices and confirm the Auth settings permit concurrent sessions.
2. Verify existing items appear in Unsorted; create, rename and recolor a section on one device and refresh the other.
3. Invite a second disposable account to a shared inventory. Confirm it can assign/move items but cannot create/rename/recolor/remove sections, including direct RPC attempts.
4. Test competing amount updates, including identical amounts with different requests. A stale save must show the attempted amount and require reload. Repeat with a response lost after a successful save; the same request must return the saved result without another version increment.
5. Remove a selected section while another device has an unsaved item draft. Verify preserved items, fallback to All items, retained draft and stale-version rejection. Repeat with reassignment and membership revocation.
6. Check iPhone full-screen picker, safe areas, keyboard, large text, VoiceOver, back/discard and foreground refresh. Record real sessions/build IDs separately from mocked browser and PGlite evidence.

Reload a Metro-connected development app after the backend deployment. A standalone installed app needs a new build (or an intentionally configured compatible update); JavaScript export alone is not a signed build or distribution.
