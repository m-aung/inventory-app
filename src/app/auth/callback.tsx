import { useEffect, useState } from "react";
import { router, useLocalSearchParams } from "expo-router";
import { Platform } from "react-native";
import { Button, Loading, Notice, Screen } from "../../components/ui";
import { supabase } from "../../lib/supabase";
import { useAuth } from "../../lib/auth";
export default function Callback() {
  const { code, mode, error_description } = useLocalSearchParams<{
    code?: string;
    mode?: string;
    error_description?: string;
  }>();
  const { setRecovery } = useAuth();
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function exchange() {
      if (!code || error_description) {
        setError(
          "This link is invalid or expired. Request a new email and open it on the original device.",
        );
        return;
      }
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (!active) return;
      if (Platform.OS === "web")
        window.history.replaceState(null, "", "/auth/callback");
      if (error) {
        setError(
          "Couldn’t complete this link. Request a new email and open it on the original device.",
        );
        return;
      }
      setRecovery(mode === "recovery");
      router.replace(mode === "recovery" ? "/new-password" : "/inventory");
    }
    void exchange();
    return () => {
      active = false;
    };
  }, [code, mode, error_description, setRecovery]);
  return (
    <Screen title="Confirming your email" back={false}>
      {error ? (
        <>
          <Notice text={error} />
          <Button title="Continue" onPress={() => router.replace("/")} />
        </>
      ) : (
        <Loading label="Completing your sign-in…" />
      )}
    </Screen>
  );
}
