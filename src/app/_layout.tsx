import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { QueryClientProvider } from "@tanstack/react-query";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { AuthProvider, useAuth } from "../lib/auth";
import { queryClient } from "../lib/query";
import { isConfigured, supabase } from "../lib/supabase";
import { FeedbackProvider } from "../components/feedback";
import { Button, Loading, Screen, styles } from "../components/ui";
import { Text } from "react-native";

function Routes() {
  const { session, ready, problem, retry } = useAuth();
  if (!isConfigured)
    return (
      <Screen title="Project setup required" back={false}>
        <Text style={styles.body}>
          Configure this development build’s Supabase URL and publishable key,
          then restart the app. No inventory data is loaded until setup is
          complete.
        </Text>
      </Screen>
    );
  if (!ready)
    return (
      <Screen back={false}>
        <Loading label="Checking your session…" />
      </Screen>
    );
  if (problem)
    return (
      <Screen title="Couldn’t verify your session" back={false}>
        <Text style={styles.subtitle}>
          Check your connection and try again.
        </Text>
        <Button title="Try again" onPress={retry} />
        <Button
          secondary
          title="Back to sign in"
          onPress={async () => {
            const { error } = await supabase.auth.signOut({ scope: "local" });
            if (!error) retry();
          }}
        />
      </Screen>
    );
  return (
    <Stack screenOptions={{ headerShown: false }}>
      <Stack.Screen name="index" />
      <Stack.Protected guard={!session}>
        <Stack.Screen name="sign-in" />
        <Stack.Screen name="register" />
        <Stack.Screen name="check-email" />
        <Stack.Screen name="forgot-password" />
      </Stack.Protected>
      <Stack.Protected guard={!!session}>
        <Stack.Screen name="(main)" />
        <Stack.Screen name="new-password" />
      </Stack.Protected>
      <Stack.Screen name="auth/callback" />
      <Stack.Screen name="privacy" />
    </Stack>
  );
}
export default function RootLayout() {
  return (
    <SafeAreaProvider>
      <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <FeedbackProvider>
            <StatusBar style="dark" />
            <Routes />
          </FeedbackProvider>
        </AuthProvider>
      </QueryClientProvider>
    </SafeAreaProvider>
  );
}
