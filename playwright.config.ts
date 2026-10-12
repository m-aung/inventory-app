import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 45000,
  expect: { timeout: 15000 },
  fullyParallel: true,
  use: {
    baseURL: `http://localhost:${process.env.E2E_PORT || "8081"}`,
    viewport: { width: 390, height: 844 },
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
      ? {
          executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
          args: ["--no-sandbox", "--disable-dev-shm-usage", "--no-zygote"],
        }
      : {},
  },
  projects: [{ name: "chromium", use: { browserName: "chromium" } }],
  webServer: {
    command: `npx expo start --web --port ${process.env.E2E_PORT || "8081"}`,
    url: `http://localhost:${process.env.E2E_PORT || "8081"}`,
    timeout: 180000,
    reuseExistingServer: false,
    env: {
      CI: "1",
      EXPO_PUBLIC_SUPABASE_URL: "https://nxjfbnuavolnpziwpbjb.supabase.co",
      EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY:
        "test-publishable-key-not-a-real-credential",
    },
  },
});
