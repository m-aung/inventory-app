import { useState } from "react";
import { Text } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import * as Linking from "expo-linking";
import { Button, Notice, Screen, styles } from "../components/ui";
import { supabase } from "../lib/supabase";
import { errorMessage } from "../lib/api";
export default function CheckEmail() {
  const { email } = useLocalSearchParams<{ email: string }>();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  async function resend() {
    if (busy || !email) return;
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: Linking.createURL("auth/callback") },
      });
      if (error) throw error;
      setMessage(
        "Confirmation email requested. Check your inbox and spam folder.",
      );
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Check your email" back={false}>
      <Text style={styles.body}>
        If registration is available for {email || "your address"}, you’ll
        receive a confirmation link. Open it on the device where you created
        your account.
      </Text>
      {message ? <Notice text={message} success /> : null}
      {error ? <Notice text={error} /> : null}
      <Button
        title={busy ? "Sending…" : "Resend confirmation"}
        busy={busy}
        onPress={resend}
      />
      <Button
        secondary
        title="Back to sign in"
        onPress={() => router.replace("/sign-in")}
      />
    </Screen>
  );
}
