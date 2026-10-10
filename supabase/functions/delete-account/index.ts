import { createClient } from "npm:@supabase/supabase-js@2.117.3";
import { accountDeletionHandler } from "./handler.ts";

const url = Deno.env.get("SUPABASE_URL")!;
const key =
  JSON.parse(Deno.env.get("SUPABASE_PUBLISHABLE_KEYS") ?? "{}").default ??
  Deno.env.get("SUPABASE_ANON_KEY")!;
const secretKey =
  JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS") ?? "{}").default ??
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const admin = createClient(url, secretKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const origins = (Deno.env.get("ALLOWED_WEB_ORIGINS") ?? "http://localhost:8081")
  .split(",")
  .map((s) => s.trim())
  .filter(Boolean);
Deno.serve(
  accountDeletionHandler(
    {
      async authenticate(token) {
        const { data, error } = await admin.auth.getUser(token);
        return !error && data.user?.email && data.user.email_confirmed_at
          ? { id: data.user.id, email: data.user.email }
          : null;
      },
      async verifyPassword(user, password) {
        // Separate client per request; never mutate a global admin client's session.
        const client = createClient(url, key, {
          auth: { persistSession: false, autoRefreshToken: false },
        });
        const { data, error } = await client.auth.signInWithPassword({
          email: user.email,
          password,
        });
        if (error || data.user?.id !== user.id) return false;
        await client.auth.signOut({ scope: "local" });
        return true;
      },
      async hasOwnedShared(userId) {
        const { count, error } = await admin
          .from("inventories")
          .select("id", { count: "exact", head: true })
          .eq("owner_id", userId)
          .eq("kind", "shared");
        if (error) throw error;
        return (count ?? 0) > 0;
      },
      async deleteUser(userId) {
        const { error } = await admin.auth.admin.deleteUser(userId);
        if (error) throw error;
      },
    },
    origins,
  ),
);
