import { useState } from "react";
import { router } from "expo-router";
import { Button, Field, Notice, Screen } from "../components/ui";
import { supabase } from "../lib/supabase";
import { passwordSchema } from "../lib/validation";
import { errorMessage } from "../lib/api";
import { useAuth } from "../lib/auth";
import { useFeedback } from "../components/feedback";
export default function NewPassword() {
  const { recovery, setRecovery } = useAuth();
  const { toast } = useFeedback();
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  async function submit() {
    if (busy) return;
    const p = passwordSchema.safeParse(password);
    if (!p.success) {
      setError(p.error.issues[0].message);
      return;
    }
    if (repeat !== password) {
      setError("Passwords don’t match.");
      return;
    }
    setBusy(true);
    setError("");
    try {
      if (!recovery) {
        const { data } = await supabase.auth.getUser();
        if (!data.user?.email) throw new Error("Session expired");
        const { error } = await supabase.auth.signInWithPassword({
          email: data.user.email,
          password: current,
        });
        if (error) throw error;
      }
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      setRecovery(false);
      toast("Password updated");
      router.replace("/inventory");
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen
      title={recovery ? "Set new password" : "Change password"}
      back={!recovery}
    >
      {!recovery && (
        <Field
          label="Current password"
          secureTextEntry
          value={current}
          onChangeText={setCurrent}
          editable={!busy}
          autoComplete="current-password"
        />
      )}
      <Field
        label="New password"
        secureTextEntry
        value={password}
        onChangeText={setPassword}
        editable={!busy}
        autoComplete="new-password"
      />
      <Field
        label="Confirm password"
        secureTextEntry
        value={repeat}
        onChangeText={setRepeat}
        editable={!busy}
        onSubmitEditing={submit}
        autoComplete="new-password"
      />
      {error ? <Notice text={error} /> : null}
      <Button
        title={busy ? "Updating…" : "Update password"}
        busy={busy}
        onPress={submit}
      />
      {recovery && (
        <Button
          secondary
          title="Cancel and sign out"
          disabled={busy}
          onPress={async () => {
            await supabase.auth.signOut({ scope: "local" });
          }}
        />
      )}
    </Screen>
  );
}
