This is an Expo/React Native mobile application. Prioritize mobile-first patterns, performance, and cross-platform compatibility.

## Inventory project rules

- Read README.md and docs/SCOPE.md first. Product name is undecided; do not invent branding or release identities.
- Day 1 is online-only, domain-agnostic, email/password, private/shared inventories. Named, colored sections were approved for release scope on October 12, 2026; see docs/SCOPE.md for implementation status and docs/SECTIONS_DEPLOYMENT.md before distributing the sections client. Do not silently add offline sync, OAuth, photos, nested categories or bot automation.
- Keep app code in src/, schema/RLS/RPC code in versioned supabase/migrations/, and server-only account deletion in supabase/functions/.
- Never ship a service-role/secret key in EXPO_PUBLIC variables, frontend source, tests or git. Never log passwords, tokens or private item data.
- Base table mutations are prohibited; preserve verified-user/owner checks in RPCs and RLS reads. New functions must explicitly revoke PUBLIC/anon execution.
- Preserve stable item IDs and version-aware edit checks. Background refresh must not overwrite an unsaved draft.
- Invitations are currently email-addressed in-app invitations; do not claim email was sent without a configured and tested delivery provider.
- Run npm run check and relevant browser tests. Run expo-doctor and both web/iOS exports when changing native dependencies/config. Run Deno check when changing the Edge Function.
- Use disposable accounts/data for destructive integration tests. Never automatically apply production migrations or delete production data as maintenance.
- The only database-dependent automated tests use PGlite with a mock Auth schema. Live Supabase/Auth and iPhone checks are separate; record evidence honestly.
- Future agents should make scoped branches, explain changed behavior, include useful tests and deployment notes, and preserve user-owned data.

## Expo has changed — do not trust your training data

Expo ships breaking changes every SDK release. APIs you remember are likely renamed, moved, or removed. Before writing any code that touches an Expo, EAS, or React Native API:

1. Read the major version of the `expo` package in `package.json`.
2. Fetch the matching versioned docs: `https://docs.expo.dev/versions/v<major>.0.0/`
3. For anything else, fetch https://docs.expo.dev/llms.txt — an index of all Expo docs with corrections to common LLM misconceptions. Follow its links to the specific page you need; never answer from memory.

## Commands

Use `bunx` instead of `npx` if the project uses bun (`bun.lock` present).

```bash
npx expo install <package>  # ALWAYS use instead of npm/yarn/pnpm/bun add — resolves SDK-compatible versions
npx expo start              # start the dev server
npx expo lint               # lint
npx tsc --noEmit            # typecheck
npx expo-doctor             # diagnose dependency and config issues
npx expo install --fix      # fix incompatible package versions
```

Run lint and typecheck before declaring any task done.

## Navigation & Routing

- Use **Expo Router** for all navigation. Routes live in `src/app/` — every file there is a screen, `_layout.tsx` files define navigators. Keep non-route code (components, hooks, utils) outside `src/app/`.
- Import `Link`, `router`, and `useLocalSearchParams` from `expo-router`.
- Docs: https://docs.expo.dev/router/introduction.md

## Building with EAS

Use EAS to build, sign, and submit the app in the cloud (`eas build`, `eas submit`) and to ship over-the-air updates (`eas update`) — no local Xcode or Android Studio required. Run EAS CLI as `bunx eas-cli <command>` in Bun projects, or `npx eas-cli@latest <command>` otherwise; substitute that for bare `eas` in docs examples.
Docs: https://docs.expo.dev/eas/index.md

## Rules

- If `ios/` and `android/` directories do not exist, they are generated (Continuous Native Generation). Never create or edit them by hand — configure native behavior in `app.json` and config plugins.
- Expo Go only includes its bundled native modules. After adding a library with native code, the app needs a development build: `npx expo run:ios|android` locally, or `eas build --profile development`.
- Prefer recommended Expo modules over third-party libraries, and check your available skills before adding dependencies. Docs: https://docs.expo.dev/versions/latest/index.md
