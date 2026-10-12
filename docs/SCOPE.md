# Agreed Day-1 scope and interactions

Confirmed by the user on October 10, 2026:

- Category-agnostic inventory, not specialized for groceries or a business domain.
- Item name, quantity, unit, optional notes. No photos/categories/expiry in Day 1.
- Online only; no queued offline mutations or synchronization.
- Private inventory per user plus separate shared family/team inventories.
- Owner invites by email; members create/edit/delete items; only owners manage other members or delete shared inventories.
- Email/password first; OAuth later.
- Approved ivory/teal visual direction. Name undecided.
- React Native/Expo + TypeScript and Supabase selected by the developer.
- Windows development; first delivery is a development build on iPhone, then TestFlight.

## Data rules

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

Sign in; registration; check-email/resend; forgot password/reset-request confirmation; auth callback; new/change password; dashboard; item details; add/edit item; inventory picker/invitation inbox; create shared inventory; manage shared inventory/members/invites; settings; confirm account deletion; about your data.

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
