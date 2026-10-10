# Supabase setup

Target project reference: `nxjfbnuavolnpziwpbjb`.

## Current deployment

The database migrations `20261010054619_inventory` and `20261010054823_private_rpc_implementations` and the `delete-account` Edge Function (version 1) were deployed to this project on October 10, 2026. All four app tables have RLS enabled; the security advisor reports no findings. SQL smoke checks passed with transaction rollback, and anonymous REST access and invalid-token function calls return HTTP 401.

Hosted authentication settings and mail delivery still require configuration and end-to-end testing. Do not rerun the initial CREATE migration in SQL Editor.

## Subsequent backend deployments

From the project root in PowerShell:

```powershell
npx supabase login
npx supabase link --project-ref nxjfbnuavolnpziwpbjb
npx supabase db push --dry-run
npx supabase db push
npx supabase functions deploy delete-account
```

Authenticate locally when prompted. Keep the database password/access token out of chat, source files and git. Review the dry run, and confirm this is the intended new project before applying it. The CLI records applied migration versions.

The local migration filenames match the hosted migration versions. Review `npx supabase migration list` after linking; a dry run should not propose recreating already-deployed tables. For a new project, apply all versioned migrations in order and deploy the Edge Function separately.

## Auth dashboard settings

- Enable email/password signup and email confirmation.
- Set the minimum password length to 12.
- Add these permitted redirect URLs:
  - `inventorydev://auth/callback`
  - `inventorydev://auth/callback?mode=recovery`
  - `http://localhost:8081/auth/callback`
  - `http://localhost:8081/auth/callback?mode=recovery`
- Use PKCE-compatible default confirmation/recovery templates that redirect via the configured callback. Test both flows on the originating device/browser.
- Configure SMTP for beta users and set sensible auth rate limits. Built-in mail is suitable only for limited initial testing and may restrict recipients.

`supabase/config.toml` defines local development settings. Linking/pushing migrations does not automatically update every hosted Auth dashboard setting; verify these manually.

## App configuration

The project's active **publishable** key is included in `.env.example`. Copy that file to `.env` for local testing. To rotate or replace it, use Project Settings → API keys, then set:

```dotenv
EXPO_PUBLIC_SUPABASE_URL=https://nxjfbnuavolnpziwpbjb.supabase.co
EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY=<publishable key>
```

The publishable key is designed for clients. Never use a secret/service-role key here. Restart Expo after editing `.env`.

## Account deletion function

The hosted function reads `SUPABASE_PUBLISHABLE_KEYS` and `SUPABASE_SECRET_KEYS`, with legacy environment-variable fallback. Secret keys remain server-only. Gateway JWT verification is disabled for this one function because the handler itself verifies each bearer token through Auth and checks reauthentication; no anonymous deletion is allowed.

For a deployed web preview, set an exact allowed browser origin:

```powershell
npx supabase secrets set ALLOWED_WEB_ORIGINS="http://localhost:8081,https://YOUR-APP-DOMAIN"
```

Native app requests do not have a browser Origin. Do not use `*` as the browser allowlist.

## Verify cloud deployment

Create two test accounts using your own test email addresses, confirm both, and run the sharing/isolation checklist in `docs/TEST_PLAN.md`. Verify anonymous calls cannot read inventories or invoke mutations. Verify account deletion in a disposable test account, including rejection when that account owns a shared inventory.

Local SQL/HTTP-fixture tests cannot prove the hosted migration, email provider, Auth configuration or gateway setup is correct. Mark cloud integration complete only after these tests pass against this project.
