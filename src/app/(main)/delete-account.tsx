import { useState } from "react";
import { Text } from "react-native";
import { router } from "expo-router";
import { Button, Field, Notice, Screen, styles } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { useWorkspace } from "../../features/workspace";
import { queryClient } from "../../lib/query";
import { useAuth } from "../../lib/auth";
import { useFeedback } from "../../components/feedback";
export default function DeleteAccount() {
  const { session } = useAuth();
  const { inventories } = useWorkspace();
  const { toast } = useFeedback();
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const owned = inventories.filter(
    (i) => i.kind === "shared" && i.owner_id === session?.user.id,
  );
  async function remove() {
    if (busy || owned.length) return;
    if (!password) {
      setError("Enter your password to confirm.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { data, error } = await supabase.functions.invoke(
        "delete-account",
        { body: { password } },
      );
      if (error || !data?.deleted) {
        let message =
          "Couldn’t confirm deletion. Check your connection and try again.";
        if (error && "context" in error && error.context instanceof Response) {
          const body = await error.context.json().catch(() => null);
          if (body?.code === "invalid_password")
            message = "Your password was not accepted.";
          if (body?.code === "owned_shared_inventory")
            message = "Delete your owned shared inventories first.";
        }
        throw new Error(message);
      }
      await supabase.auth.signOut({ scope: "local" });
      queryClient.clear();
      toast("Your account has been deleted.");
      router.replace("/sign-in");
    } catch (e) {
      setError(
        e instanceof Error ? e.message : "Couldn’t confirm account deletion.",
      );
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Confirm account deletion">
      <Text style={styles.body}>
        Enter your password to permanently delete your account and private
        inventory. This cannot be undone.
      </Text>
      {owned.length > 0 ? (
        <>
          <Notice text="You own shared inventories. Delete them explicitly before deleting your account." />
          <Button
            title="Manage shared inventories"
            onPress={() => router.push("/inventories")}
          />
        </>
      ) : (
        <>
          <Field
            label="Password"
            secureTextEntry
            value={password}
            onChangeText={setPassword}
            editable={!busy}
            autoComplete="current-password"
          />
          {error ? <Notice text={error} /> : null}
          <Button
            title={busy ? "Deleting account…" : "Delete account permanently"}
            busy={busy}
            danger
            onPress={remove}
          />
        </>
      )}
    </Screen>
  );
}
