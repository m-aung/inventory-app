const { defineConfig } = require("eslint/config");
const expo = require("eslint-config-expo/flat");
module.exports = defineConfig([
  expo,
  {
    ignores: [
      "dist/**",
      "supabase/functions/delete-account/index.ts",
      "playwright-report/**",
      "test-results/**",
    ],
  },
]);
