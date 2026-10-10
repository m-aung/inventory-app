# iPhone testing from Windows

Use an Expo development build rather than relying on the App Store version of Expo Go matching this project's SDK 57. Your paid Apple Developer membership can provision the iPhone build.

## Development build

1. Choose the final bundle identifier before registering a permanent App ID; the current `com.maung.inventory.dev` is only a development placeholder.
2. Create/sign into your own Expo account.
3. From the root in PowerShell:

```powershell
npx eas-cli@latest login
npx eas-cli@latest init
npx eas-cli@latest build:configure
npx eas-cli@latest device:create
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_SUPABASE_URL --value https://nxjfbnuavolnpziwpbjb.supabase.co --visibility plaintext
npx eas-cli@latest env:create --environment development --name EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY --value YOUR_PUBLISHABLE_KEY --visibility plaintext
npx eas-cli@latest build --platform ios --profile development
```

The last command opens Apple's provisioning flow as needed. Complete Apple sign-in/2FA securely in your own terminal/browser. Do not paste Apple credentials or recovery codes in chat. Register your iPhone using the device-registration link. EAS `init` supplies the project UUID; retain that change in git.

Install the finished build on your iPhone and enable Developer Mode if prompted. Run:

```powershell
npx expo start --dev-client
```

Open the development-build link/QR on the phone. Use the same network; if needed try `--tunnel` and follow Expo's instructions. Test secure session storage, keyboards, gestures and email callbacks on the real device.

## TestFlight after device acceptance

Create an App Store Connect app using your chosen name and bundle identifier. Set production EAS variables for the Supabase URL/publishable key and `APP_BUNDLE_IDENTIFIER`; optionally set `APP_DISPLAY_NAME`. The config blocks a production build without an explicit identifier.

```powershell
npx eas-cli@latest build --platform ios --profile production
npx eas-cli@latest submit --platform ios --profile production
```

These are user-owned distribution steps, not evidence a signed build already exists. Follow EAS prompts to associate the App Store Connect app and credentials. Add testers after processing completes. External TestFlight testing may require Apple's beta review.

## Before public release

Choose a final icon, support email/URL, hosted privacy policy and any required terms; complete privacy disclosures and screenshots; verify mail delivery, account deletion, sharing permissions and backups. Browser tests and JavaScript exports do not replace a signed native build or App Store review.
