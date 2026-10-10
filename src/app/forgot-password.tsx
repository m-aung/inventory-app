import { useState } from "react";
import { Text } from "react-native";
import * as Linking from "expo-linking";
import { router } from "expo-router";
import { Button, Field, Notice, Screen, styles } from "../components/ui";
import { supabase } from "../lib/supabase";
import { emailSchema } from "../lib/validation";
import { errorMessage } from "../lib/api";
export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  async function submit() {
    if (busy) return;
    const parsed = emailSchema.safeParse(email.trim());
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setBusy(true);
    setError("");
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(parsed.data, {
        redirectTo: Linking.createURL("auth/callback", {
          queryParams: { mode: "recovery" },
        }),
      });
      if (error) throw error;
      setSent(true);
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen title="Reset password">
      <Text style={styles.subtitle}>
        Enter your email to receive a reset link. Open the link on this device.
      </Text>
      {sent ? (
        <Notice
          success
          text="If an account exists for this email, we’ve sent a reset link."
        />
      ) : (
        <Field
          label="Email"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          keyboardType="email-address"
          editable={!busy}
          onSubmitEditing={submit}
        />
      )}
      {error ? <Notice text={error} /> : null}
      {!sent && (
        <Button
          title={busy ? "Sending…" : "Send reset link"}
          busy={busy}
          onPress={submit}
        />
      )}
      <Button
        secondary
        title="Back to sign in"
        onPress={() => router.replace("/sign-in")}
      />
    </Screen>
  );
}
