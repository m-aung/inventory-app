import { useState, type ReactNode, type Ref } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type TextInputProps,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";

export const colors = {
  bg: "#F7F8F4",
  card: "#FFFFFF",
  ink: "#152B2A",
  muted: "#586C6A",
  teal: "#00796F",
  pale: "#E4F3ED",
  line: "#DFE6E2",
  red: "#B42332",
  redBg: "#FDECEE",
};
export const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.bg },
  content: {
    padding: 22,
    gap: 20,
    width: "100%",
    maxWidth: 640,
    alignSelf: "center",
    flexGrow: 1,
    paddingBottom: 32,
  },
  title: {
    fontSize: 30,
    fontWeight: "700",
    color: colors.ink,
    letterSpacing: -0.8,
  },
  subtitle: { fontSize: 15, lineHeight: 23, color: colors.muted },
  label: { fontSize: 14, fontWeight: "600", color: colors.ink },
  body: { fontSize: 16, lineHeight: 24, color: colors.ink },
  small: { fontSize: 13, lineHeight: 20, color: colors.muted },
  card: {
    backgroundColor: colors.card,
    borderRadius: 18,
    padding: 20,
    gap: 12,
    borderWidth: 1,
    borderColor: colors.line,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 12 },
  between: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
  },
  input: {
    borderWidth: 1,
    borderColor: "#BCCAC5",
    backgroundColor: colors.card,
    borderRadius: 12,
    padding: 14,
    minHeight: 50,
    color: colors.ink,
    fontSize: 16,
  },
  error: { color: colors.red, fontSize: 14, lineHeight: 20 },
  link: { color: colors.teal, fontSize: 15, fontWeight: "600" },
});
export function Screen({
  title,
  subtitle,
  children,
  back = true,
  action,
}: {
  title?: string;
  subtitle?: string;
  children: ReactNode;
  back?: boolean;
  action?: ReactNode;
}) {
  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === "ios" ? "padding" : undefined}
      >
        <ScrollView
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={styles.content}
        >
          {back && (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="Go back"
              onPress={() =>
                router.canGoBack()
                  ? router.back()
                  : router.replace("/inventory")
              }
              style={{
                minHeight: 44,
                justifyContent: "center",
                alignSelf: "flex-start",
              }}
            >
              <View style={styles.row}>
                <Ionicons name="chevron-back" size={20} color={colors.teal} />
                <Text style={styles.link}>Back</Text>
              </View>
            </Pressable>
          )}
          {title && (
            <View style={styles.between}>
              <View style={{ flex: 1 }}>
                <Text accessibilityRole="header" style={styles.title}>
                  {title}
                </Text>
                {subtitle && (
                  <Text style={[styles.subtitle, { marginTop: 8 }]}>
                    {subtitle}
                  </Text>
                )}
              </View>
              {action}
            </View>
          )}
          {children}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
export function Button({
  title,
  onPress,
  busy = false,
  disabled = false,
  danger = false,
  secondary = false,
  testID,
}: {
  title: string;
  onPress: () => void;
  busy?: boolean;
  disabled?: boolean;
  danger?: boolean;
  secondary?: boolean;
  testID?: string;
}) {
  return (
    <Pressable
      testID={testID}
      accessibilityRole="button"
      accessibilityLabel={title}
      accessibilityState={{ disabled: disabled || busy, busy }}
      disabled={disabled || busy}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 52,
        borderRadius: 12,
        padding: 14,
        alignItems: "center",
        justifyContent: "center",
        opacity: disabled || busy ? 0.55 : pressed ? 0.8 : 1,
        backgroundColor: secondary
          ? colors.pale
          : danger
            ? colors.red
            : colors.teal,
      })}
    >
      <View style={styles.row}>
        {busy && <ActivityIndicator color={secondary ? colors.teal : "#fff"} />}
        <Text
          style={{
            fontSize: 16,
            fontWeight: "600",
            textAlign: "center",
            color: secondary ? colors.teal : "#fff",
          }}
        >
          {title}
        </Text>
      </View>
    </Pressable>
  );
}
export function Field({
  label,
  error,
  inputRef,
  ...props
}: TextInputProps & {
  label: string;
  error?: string;
  inputRef?: Ref<TextInput>;
}) {
  const [visible, setVisible] = useState(false);
  const password = props.secureTextEntry;
  return (
    <View style={{ gap: 8 }}>
      <Text style={styles.label}>{label}</Text>
      <View>
        <TextInput
          {...props}
          ref={inputRef}
          accessibilityLabel={label}
          placeholderTextColor={colors.muted}
          secureTextEntry={password && !visible}
          style={[
            styles.input,
            error ? { borderColor: colors.red } : {},
            password ? { paddingRight: 54 } : {},
            props.style,
          ]}
        />
        {password && (
          <Pressable
            onPress={() => setVisible((v) => !v)}
            accessibilityRole="button"
            accessibilityLabel={visible ? "Hide password" : "Show password"}
            style={{
              position: "absolute",
              right: 4,
              top: 3,
              minWidth: 44,
              minHeight: 44,
              justifyContent: "center",
              alignItems: "center",
            }}
          >
            <Ionicons
              name={visible ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={colors.muted}
            />
          </Pressable>
        )}
      </View>
      {props.onBlur ? (
        <View style={{ minHeight: 40 }}>
          {error ? (
            <Text accessibilityRole="alert" style={styles.error}>
              {error}
            </Text>
          ) : null}
        </View>
      ) : error ? (
        <Text accessibilityRole="alert" style={styles.error}>
          {error}
        </Text>
      ) : null}
    </View>
  );
}
export function Notice({
  text,
  success = false,
}: {
  text: string;
  success?: boolean;
}) {
  return (
    <View
      accessibilityRole="alert"
      accessibilityLiveRegion="polite"
      style={{
        padding: 14,
        borderRadius: 12,
        backgroundColor: success ? colors.pale : colors.redBg,
        flexDirection: "row",
        gap: 10,
      }}
    >
      <Ionicons
        name={success ? "checkmark-circle-outline" : "alert-circle-outline"}
        size={22}
        color={success ? colors.teal : colors.red}
      />
      <Text
        style={[
          styles.body,
          { flex: 1, color: success ? colors.teal : colors.red },
        ]}
      >
        {text}
      </Text>
    </View>
  );
}
export function Loading({ label = "Loading…" }: { label?: string }) {
  return (
    <View style={{ alignItems: "center", padding: 50, gap: 16 }}>
      <ActivityIndicator color={colors.teal} size="large" />
      <Text style={styles.subtitle}>{label}</Text>
    </View>
  );
}
export function ErrorState({
  text,
  retry,
}: {
  text: string;
  retry: () => void;
}) {
  return (
    <View style={{ gap: 20 }}>
      <Notice text={text} />
      <Button title="Try again" onPress={retry} />
    </View>
  );
}
export function Skeleton() {
  return (
    <View accessibilityLabel="Loading inventory" style={{ gap: 12 }}>
      {[0, 1, 2, 3, 4].map((i) => (
        <View
          key={i}
          style={[
            styles.card,
            { height: 76, flexDirection: "row", alignItems: "center" },
          ]}
        >
          <View
            style={{
              width: 40,
              height: 40,
              backgroundColor: colors.line,
              borderRadius: 12,
            }}
          />
          <View
            style={{
              height: 16,
              width: "55%",
              backgroundColor: colors.line,
              borderRadius: 8,
            }}
          />
        </View>
      ))}
    </View>
  );
}
