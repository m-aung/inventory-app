import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AccessibilityInfo, Modal, Pressable, Text, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Button, colors, Notice, styles } from "./ui";

type Question = {
  title: string;
  message: string;
  action?: string;
  danger?: boolean;
};
const Context = createContext<{
  toast: (text: string) => void;
  confirm: (question: Question) => Promise<boolean>;
}>({ toast: () => {}, confirm: async () => false });
export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [message, setMessage] = useState("");
  const [question, setQuestion] = useState<Question | null>(null);
  const resolver = useRef<((value: boolean) => void) | null>(null);
  useEffect(() => {
    if (!message) return;
    AccessibilityInfo.announceForAccessibility(message);
    const timer = setTimeout(() => setMessage(""), 4000);
    return () => clearTimeout(timer);
  }, [message]);
  useEffect(() => () => resolver.current?.(false), []);
  function close(value: boolean) {
    resolver.current?.(value);
    resolver.current = null;
    setQuestion(null);
  }
  return (
    <Context.Provider
      value={{
        toast: setMessage,
        confirm: (q) =>
          new Promise((resolve) => {
            resolver.current?.(false);
            resolver.current = resolve;
            setQuestion(q);
          }),
      }}
    >
      {children}
      {!!message && (
        <SafeAreaView
          pointerEvents="none"
          edges={["bottom"]}
          style={{
            position: "absolute",
            bottom: 20,
            left: 20,
            right: 20,
            maxWidth: 600,
            alignSelf: "center",
          }}
        >
          <Notice text={message} success />
        </SafeAreaView>
      )}
      <Modal
        transparent
        visible={!!question}
        animationType="fade"
        onRequestClose={() => close(false)}
      >
        <View
          style={{
            flex: 1,
            backgroundColor: "#10272480",
            justifyContent: "flex-end",
          }}
        >
          <Pressable
            accessibilityLabel="Cancel confirmation"
            onPress={() => close(false)}
            style={{ flex: 1 }}
          />
          <SafeAreaView
            edges={["bottom"]}
            style={{
              backgroundColor: colors.card,
              borderTopLeftRadius: 24,
              borderTopRightRadius: 24,
            }}
          >
            <View
              accessibilityViewIsModal
              style={{
                padding: 24,
                gap: 20,
                maxWidth: 640,
                width: "100%",
                alignSelf: "center",
              }}
            >
              <Text
                accessibilityRole="header"
                style={[styles.title, { fontSize: 23 }]}
              >
                {question?.title}
              </Text>
              <Text style={styles.body}>{question?.message}</Text>
              <Button
                title={question?.action ?? "Continue"}
                danger={question?.danger ?? false}
                onPress={() => close(true)}
              />
              <Button title="Cancel" secondary onPress={() => close(false)} />
            </View>
          </SafeAreaView>
        </View>
      </Modal>
    </Context.Provider>
  );
}
export const useFeedback = () => useContext(Context);
