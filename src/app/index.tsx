import { Redirect } from "expo-router";
import { useAuth } from "../lib/auth";
export default function Index() {
  const { session, recovery } = useAuth();
  return (
    <Redirect
      href={session ? (recovery ? "/new-password" : "/inventory") : "/sign-in"}
    />
  );
}
