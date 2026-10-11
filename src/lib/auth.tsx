import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { AppState, Platform } from "react-native";
import { focusManager } from "@tanstack/react-query";
import { isAuthSessionMissingError, type Session } from "@supabase/supabase-js";
import { supabase, isConfigured } from "./supabase";
import { queryClient } from "./query";

const AuthContext = createContext<{
  session: Session | null;
  ready: boolean;
  recovery: boolean;
  setRecovery: (value: boolean) => void;
  problem: boolean;
  retry: () => void;
}>({
  session: null,
  ready: false,
  recovery: false,
  setRecovery: () => {},
  problem: false,
  retry: () => {},
});
export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [ready, setReady] = useState(!isConfigured);
  const [problem, setProblem] = useState(false);
  const [attempt, setAttempt] = useState(0);
  const [recovery, setRecovery] = useState(false);
  const lastUser = useRef<string | undefined>(undefined);
  useEffect(() => {
    if (!isConfigured) return;
    let active = true;
    const { data: listener } = supabase.auth.onAuthStateChange(
      (event, next) => {
        if (!active) return;
        if (lastUser.current !== next?.user.id) queryClient.clear();
        lastUser.current = next?.user.id;
        setSession(next);
        if (event === "PASSWORD_RECOVERY") setRecovery(true);
        if (event === "SIGNED_OUT") setRecovery(false);
      },
    );
    supabase.auth
      .getSession()
      .then(async ({ data, error }) => {
        if (error) throw error;
        if (data.session) {
          const result = await supabase.auth.getUser();
          if (result.error) {
            if (
              result.error.status === 401 ||
              result.error.status === 403 ||
              result.error.status === 404 ||
              isAuthSessionMissingError(result.error) ||
              result.error.code === "user_not_found" ||
              result.error.code === "session_not_found"
            ) {
              const { error: signOutError } = await supabase.auth.signOut({
                scope: "local",
              });
              if (signOutError) throw signOutError;
            } else throw result.error;
          } else if (active) setSession(data.session);
        }
      })
      .catch(() => {
        if (active) setProblem(true);
      })
      .finally(() => {
        if (active) setReady(true);
      });
    const appState = AppState.addEventListener("change", (state) => {
      focusManager.setFocused(state === "active");
      if (state === "active") supabase.auth.startAutoRefresh();
      else supabase.auth.stopAutoRefresh();
    });
    if (Platform.OS !== "web") supabase.auth.startAutoRefresh();
    return () => {
      active = false;
      listener.subscription.unsubscribe();
      appState.remove();
      supabase.auth.stopAutoRefresh();
    };
  }, [attempt]);
  return (
    <AuthContext.Provider
      value={{
        session,
        ready,
        recovery,
        setRecovery,
        problem,
        retry: () => {
          setReady(false);
          setProblem(false);
          setAttempt((v) => v + 1);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
