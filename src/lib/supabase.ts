import "react-native-url-polyfill/auto";
import { createClient, processLock } from "@supabase/supabase-js";
import { sessionStorage } from "./storage";

export const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL ?? "";
const key = process.env.EXPO_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";
export const isConfigured = Boolean(supabaseUrl && key);
// A missing configuration gets a setup screen, never fake inventory data.
export const supabase = createClient(
  supabaseUrl || "https://not-configured.supabase.co",
  key || "not-configured",
  {
    auth: {
      storage: sessionStorage,
      autoRefreshToken: true,
      persistSession: true,
      detectSessionInUrl: false,
      flowType: "pkce",
      lock: processLock,
    },
    global: {
      fetch: (input, init) =>
        fetch(input, {
          ...init,
          signal: init?.signal ?? AbortSignal.timeout(20000),
        }),
    },
  },
);
