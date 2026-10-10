import { useState } from "react";
import { Text, View } from "react-native";
import { router } from "expo-router";
import { Button, Notice, Screen, styles } from "../../components/ui";
import { useAuth } from "../../lib/auth";
import { supabase } from "../../lib/supabase";
import { errorMessage } from "../../lib/api";
import { queryClient } from "../../lib/query";
import { useFeedback } from "../../components/feedback";
export default function Settings() {
  const { session } = useAuth();
  const { confirm } = useFeedback();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  async function signOut() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.signOut({ scope: "local" });
      if (error) throw error;
      queryClient.clear();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Settings">
      <View style={styles.card}>
        <Text style={styles.label}>Account</Text>
        <Text style={styles.body}>{session?.user.email}</Text>
      </View>
      <Button
        secondary
        title="Change password"
        onPress={() => router.push("/new-password")}
      />
      <Button
        secondary
        title="Manage inventories & invitations"
        onPress={() => router.push("/inventories")}
      />
      <Button
        secondary
        title="About your data"
        onPress={() => router.push("/privacy")}
      />
      {error ? <Notice text={error} /> : null}
      <Button
        secondary
        title={busy ? "Signing out…" : "Sign out"}
        busy={busy}
        onPress={signOut}
      />
      <Button
        danger
        title="Delete account"
        onPress={async () => {
          if (
            await confirm({
              title: "Delete your account?",
              message:
                "Your account and private inventory will be permanently deleted. You must delete any shared inventories you own first. Items in other people’s inventories will remain.",
              action: "Continue",
              danger: true,
            })
          )
            router.push("/delete-account");
        }}
      />
    </Screen>
  );
}
