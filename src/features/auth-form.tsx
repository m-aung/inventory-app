import { useRef, useState } from "react";
import { Pressable, Text, TextInput, View } from "react-native";
import { router } from "expo-router";
import * as Linking from "expo-linking";
import { Ionicons } from "@expo/vector-icons";
import {
  Button,
  colors,
  Field,
  Notice,
  Screen,
  styles,
} from "../components/ui";
import { supabase } from "../lib/supabase";
import { emailSchema, passwordSchema } from "../lib/validation";
import { errorMessage } from "../lib/api";

export function AuthForm({ register = false }: { register?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [repeat, setRepeat] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [problem, setProblem] = useState("");
  const [busy, setBusy] = useState(false);
  const emailInput = useRef<TextInput>(null);
  const passwordInput = useRef<TextInput>(null);
  const repeatInput = useRef<TextInput>(null);
  function validateField(field: "email" | "password" | "repeat") {
    let error = "";
    if (field === "email") {
      const result = emailSchema.safeParse(email.trim());
      if (!result.success) error = result.error.issues[0].message;
    }
    if (field === "password") {
      if (register) {
        const result = passwordSchema.safeParse(password);
        if (!result.success) error = result.error.issues[0].message;
      } else if (!password) error = "Enter your password.";
    }
    if (field === "repeat" && repeat !== password)
      error = "Passwords don’t match.";
    setErrors((e) => ({ ...e, [field]: error }));
  }
  async function submit() {
    if (busy) return;
    const e = emailSchema.safeParse(email.trim());
    const p = register ? passwordSchema.safeParse(password) : null;
    const next: Record<string, string> = {};
    if (!e.success) next.email = e.error.issues[0].message;
    if (register && p && !p.success) next.password = p.error.issues[0].message;
    if (!register && !password) next.password = "Enter your password.";
    if (register && password !== repeat) next.repeat = "Passwords don’t match.";
    setErrors(next);
    setProblem("");
    if (Object.keys(next).length || !e.success) {
      if (next.email) emailInput.current?.focus();
      else if (next.password) passwordInput.current?.focus();
      else repeatInput.current?.focus();
      return;
    }
    setBusy(true);
    try {
      if (register) {
        const { data, error } = await supabase.auth.signUp({
          email: e.data,
          password,
          options: { emailRedirectTo: Linking.createURL("auth/callback") },
        });
        if (error) throw error;
        if (!data.session)
          router.push({ pathname: "/check-email", params: { email: e.data } });
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: e.data,
          password,
        });
        if (error) throw error;
        router.replace("/inventory");
      }
    } catch (error) {
      setProblem(errorMessage(error));
    } finally {
      setBusy(false);
    }
  }
  return (
    <Screen back={register}>
      <View style={{ alignItems: "center", gap: 12, paddingVertical: 28 }}>
        <View
          style={{
            padding: 18,
            backgroundColor: colors.teal,
            borderRadius: 20,
          }}
        >
          <Ionicons name="cube-outline" size={40} color="white" />
        </View>
        <Text accessibilityRole="header" style={styles.title}>
          {register ? "Create account" : "Your inventory"}
        </Text>
        <Text style={styles.subtitle}>
          {register
            ? "Start with your own private inventory."
            : "Know what you have."}
        </Text>
      </View>
      {problem ? <Notice text={problem} /> : null}
      <Field
        inputRef={emailInput}
        label="Email"
        value={email}
        onChangeText={setEmail}
        onBlur={() => validateField("email")}
        error={errors.email}
        autoCapitalize="none"
        keyboardType="email-address"
        autoComplete="email"
        editable={!busy}
        placeholder="you@example.com"
      />
      <Field
        inputRef={passwordInput}
        label="Password"
        value={password}
        onChangeText={setPassword}
        onBlur={() => validateField("password")}
        error={errors.password}
        secureTextEntry
        autoComplete={register ? "new-password" : "current-password"}
        editable={!busy}
        onSubmitEditing={register ? undefined : submit}
      />
      {register && (
        <>
          <Field
            inputRef={repeatInput}
            label="Confirm password"
            value={repeat}
            onChangeText={setRepeat}
            onBlur={() => validateField("repeat")}
            error={errors.repeat}
            secureTextEntry
            autoComplete="new-password"
            editable={!busy}
            onSubmitEditing={submit}
          />
          <Text style={styles.small}>Use at least 12 characters.</Text>
        </>
      )}
      <Button
        title={
          busy
            ? register
              ? "Creating account…"
              : "Signing in…"
            : register
              ? "Create account"
              : "Sign in"
        }
        busy={busy}
        onPress={submit}
      />
      {!register && (
        <Pressable
          accessibilityRole="link"
          onPress={() => router.push("/forgot-password")}
          style={{
            minHeight: 44,
            justifyContent: "center",
            alignItems: "center",
          }}
        >
          <Text style={styles.link}>Forgot password?</Text>
        </Pressable>
      )}
      <Button
        secondary
        title={register ? "Back to sign in" : "Create account"}
        disabled={busy}
        onPress={() =>
          register ? router.replace("/sign-in") : router.push("/register")
        }
      />
      <Pressable
        accessibilityRole="link"
        onPress={() => router.push("/privacy")}
        style={{
          minHeight: 44,
          alignItems: "center",
          justifyContent: "center",
        }}
      >
        <Text style={styles.link}>About your data</Text>
      </Pressable>
    </Screen>
  );
}
