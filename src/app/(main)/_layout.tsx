import { Stack, Redirect } from "expo-router";
import { WorkspaceProvider } from "../../features/workspace";
import { useAuth } from "../../lib/auth";
export default function MainLayout() {
  const { session, recovery } = useAuth();
  if (recovery) return <Redirect href="/new-password" />;
  return (
    <WorkspaceProvider key={session?.user.id}>
      <Stack screenOptions={{ headerShown: false }} />
    </WorkspaceProvider>
  );
}
