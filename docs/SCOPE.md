# Agreed Day-1 scope and interactions

Confirmed by the user on October 10, 2026:

- Category-agnostic inventory, not specialized for groceries or a business domain.
- Item name, quantity, unit, optional notes, and optional assignment to a user-defined section. No photos/expiry in Day 1. Colored sections were added to release scope on October 12, 2026; the backend migration is deployed, with live acceptance still pending.
- Online only; no queued offline mutations or synchronization.
- Private inventory per user plus separate shared family/team inventories.
- Owner invites by email; members create/edit/delete items; only owners manage other members or delete shared inventories.
- Email/password first; OAuth later.
- Approved ivory/teal visual direction. Name undecided.
- October 12 refinement: light finance-inspired UI with neutral surfaces, a deep-teal record-count overview, grouped quantity controls, and pill-shaped primary actions. Dark styling remains a design concept.
- React Native/Expo + TypeScript and Supabase selected by the developer.
- Windows development; first delivery is a development build on iPhone, then TestFlight.

## Notebook inventories and colored sections — added October 12, 2026

Approved scope expansion; implemented locally on `codex/notebook-sections`. The hosted migration was explicitly approved and deployed October 12, 2026; live-device acceptance remains required:

- Each existing private/shared inventory is presented as one notebook. This is an organizational metaphor; existing inventory ownership and sharing boundaries remain intact.
- A notebook contains one level of user-defined sections (categories), each with a name and chosen color. No nested categories in the initial release.
- An item belongs to at most one section within its own inventory. Users can move an item between sections without changing its ID or quantity.
- All items includes every item in the selected notebook; Unsorted contains items without a section. Existing items start Unsorted and remain accessible without mandatory categorization.
- Selecting a section narrows the list; search and availability filters combine with that selection. The notebook overview continues to count all records in the notebook, with a separate selected-section count.
- Section labels and selection indicators accompany colors so navigation never relies on color alone. A second row beneath the notebook picker shows the selected section and a labeled Sections action; tapping opens a full-screen section picker. Quick decrease/exact-amount/increase controls remain visible on items.
- Section creation, renaming, recoloring and removal belong to release scope. Removing a section must preserve its items by moving them to Unsorted, with a clear confirmation.
- Section assignment must preserve version-aware item updates and unsaved drafts. Shared sections are visible to inventory members; section access must never grant access beyond inventory membership.
- Management policy approved October 12: private inventory owners manage their sections; only shared inventory owners create, rename, recolor or remove shared sections. Owners and members can assign/move items. All members can view sections. Sections inherit inventory membership and never have separate memberships.
- Add/edit item offers optional section assignment. New items default to the current section; when viewing All items, they default to Unsorted. All items and Unsorted are permanent views. Section removal requires confirmation and preserves item IDs, quantities and notes by moving items to Unsorted.
- Section picker provides Add section and Manage sections only to users permitted to manage that inventory's sections. Names are trimmed, 1–80 characters, unique case-insensitively within an inventory; All items and Unsorted are reserved. Palette: Blue, Purple, Amber, Teal and Rose.
- Versioned schema/RLS/RPC changes, compatibility for existing items, PGlite authorization tests, browser workflow tests and deployment notes are included. Hosted migration `20261012115823_notebook_sections` is deployed with the user's explicit approval.

## Multiple devices — Day-1 expectations

- Online access to the same account's private/shared inventory data from multiple signed-in devices is part of Day 1, subject to hosted Auth session settings. Same-account multi-device acceptance is not yet verified.
- Inventory items and section names/colors/assignments are server-owned shared state. Search text, chosen notebook/section, scroll position and unsaved drafts are local to each device; changing these must not switch another device's view.
- Current implementation polls item list/details every 15 seconds and inventory lists every 30 seconds while queries are active. These are polling intervals, not freshness guarantees; background suspension and network failures can delay updates. Manual dashboard refresh is available. No instant push synchronization or offline editing is implemented.
- Item and section updates use version checks and preserve drafts on conflicts. New-client item requests also carry stable mutation identifiers, so identical amounts from different requests cannot masquerade as a retry. Concurrent changes require explicit reload; do not silently combine stale absolute quantities or overwrite newer data. Item conflict notices show the attempted amount and explain that reload replaces unsaved changes.
- Queries refresh on return to the foreground. A remotely removed selected section falls back to All items; items with open quantity drafts stay visible through remote reassignment. Browser tests cover these draft/selection behaviors; real native foreground behavior remains an acceptance requirement.
- Before release, test two devices signed in to one account and two accounts sharing an inventory: changes, competing quantity edits, section rename/recolor/removal and assignment, foreground recovery and membership revocation. Use disposable test data and record live-device evidence separately from mocked browser/PGlite tests.

## Item data rules

| Field                 | Rule                                                                          |
| --------------------- | ----------------------------------------------------------------------------- |
| Name                  | Trimmed, required, 1–100 characters                                           |
| Quantity              | 0–999,999 inclusive; maximum 3 decimal places                                 |
| Unit                  | pcs, bottles, bags, boxes, kg, g, L, mL                                       |
| Notes                 | Optional, maximum 500 characters                                              |
| Shared inventory name | Trimmed, required, 1–80 characters                                            |
| Password              | New passwords 12–128 characters; existing-password validation checks presence |

Zero means out of stock. Positive means available. Duplicate item names are allowed. Summaries count item records, not a sum of incompatible units. Search is case-insensitive by name in the selected inventory; filters apply within it.

Dashboard quantity controls (approved October 11, 2026): +/− save immediately in steps of one selected unit, preserve three-decimal precision and clamp at 0/999,999. Tap the amount to enter an exact quantity; zero marks it out of stock. Item details also offer “Mark out of stock.” Controls disable during a save; failures retain exact-entry drafts, and conflicts require explicit reload. Updates use the existing version-aware RPC; no backend deployment is needed.

## Screen inventory

Sign in; registration; check-email/resend; forgot password/reset-request confirmation; auth callback; new/change password; dashboard with notebook/section navigation; section create/edit/manage; item details; add/edit item with optional section assignment; inventory picker/invitation inbox; create shared inventory; manage shared inventory/members/invites; settings; confirm account deletion; about your data.

## States

- Initial dashboard load uses skeletons, never invented records/counts.
- Refresh keeps the last loaded records; failure warns that previously loaded data is shown.
- Initial failure offers retry. Empty inventory and no search matches have different explanations/actions.
- Save disables duplicate submission and keeps draft values on failure.
- Server-confirmed create/update/delete shows a brief accessible success notice.
- Back navigation with unsaved item edits asks for discard confirmation. Cancelling keeps the draft.
- Deleting an item explains its removal affects all members of that inventory.
- Shared-inventory deletion explains all items/memberships will be removed for everyone.
- Members can leave without deleting the inventory or items.
- Concurrent edits return a conflict; the user explicitly reloads instead of overwriting newer data.
- Account deletion asks for confirmation then the current password. Owned shared inventories must be explicitly removed first; another owner's shared items remain.

## Decisions requiring follow-up before distribution

- Final product name, bundle identifier and Expo project ownership.
- Whether email-addressed in-app invitations also need delivered invitation emails for beta. That needs a provider/domain configuration.
- Support contact and formal public privacy policy/terms. The in-app “About your data” text is informational, not a substitute for release documents.
- SMTP setup, rate limits, backup plan, operational monitoring and beta tester list.
- Production deployment and App Store submission are separate release steps; a local bundle export is not a signed app.
