import type { ExpoConfig } from "expo/config";
const bundle = process.env.APP_BUNDLE_IDENTIFIER || "com.maung.inventory.dev";
if (
  process.env.EAS_BUILD_PROFILE === "production" &&
  !process.env.APP_BUNDLE_IDENTIFIER
) {
  throw new Error(
    "Set your chosen APP_BUNDLE_IDENTIFIER before a production build.",
  );
}
const config: ExpoConfig = {
  name: process.env.APP_DISPLAY_NAME || "Inventory Dev",
  slug: "inventory-app",
  version: "0.1.0",
  orientation: "portrait",
  scheme: "inventorydev",
  userInterfaceStyle: "light",
  icon: "./assets/icon.png",
  plugins: ["expo-router", "expo-secure-store", "expo-font"],
  ios: {
    supportsTablet: false,
    bundleIdentifier: bundle,
    infoPlist: { ITSAppUsesNonExemptEncryption: false },
  },
  android: { package: bundle },
  web: { bundler: "metro", output: "single", favicon: "./assets/favicon.png" },
  experiments: { typedRoutes: true },
  owner: "myo.aung",
  extra: { eas: { projectId: "e9503383-2002-40e4-8dc7-2243be15132e" } },
};
export default config;
