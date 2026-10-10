import { useState } from "react";
import { Pressable, Text, View } from "react-native";
import { router } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api, errorMessage } from "../../lib/api";
import { queryClient } from "../../lib/query";
import { useAuth } from "../../lib/auth";
import { useWorkspace } from "../../features/workspace";
import {
  Button,
  colors,
  ErrorState,
  Loading,
  Notice,
  Screen,
  styles,
} from "../../components/ui";
import { useFeedback } from "../../components/feedback";
export default function Inventories() {
  const { inventories, selected, select, loading, error, refresh } =
    useWorkspace();
  const { session } = useAuth();
  const { toast } = useFeedback();
  const [problem, setProblem] = useState("");
  const invites = useQuery({
    queryKey: ["invitations", session?.user.id],
    queryFn: api.invitations,
    refetchInterval: 30000,
  });
  const mutation = useMutation({
    mutationFn: ({ id, accept }: { id: string; accept: boolean }) =>
      api.respond(id, accept),
    onSuccess: async (_, values) => {
      await refresh();
      await queryClient.invalidateQueries({ queryKey: ["invitations"] });
      toast(values.accept ? "Invitation accepted" : "Invitation declined");
    },
  });
  async function respond(id: string, accept: boolean) {
    setProblem("");
    try {
      await mutation.mutateAsync({ id, accept });
    } catch (e) {
      setProblem(errorMessage(e));
    }
  }
  return (
    <Screen
      title="Your inventories"
      subtitle="Keep your own list, or collaborate with others."
    >
      {loading ? (
        <Loading />
      ) : error && !inventories.length ? (
        <ErrorState
          text="Couldn’t load inventories."
          retry={() => void refresh()}
        />
      ) : (
        inventories.map((inventory) => (
          <View key={inventory.id} style={styles.card}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Select ${inventory.name}`}
              onPress={() => {
                select(inventory.id);
                router.dismissTo("/inventory");
              }}
              style={styles.between}
            >
              <View style={[styles.row, { flex: 1 }]}>
                <Ionicons
                  name={
                    inventory.kind === "private"
                      ? "lock-closed-outline"
                      : "people-outline"
                  }
                  size={25}
                  color={colors.teal}
                />
                <View style={{ flex: 1 }}>
                  <Text style={[styles.body, { fontWeight: "600" }]}>
                    {inventory.name}
                  </Text>
                  <Text style={styles.small}>
                    {inventory.kind === "private"
                      ? "Only you"
                      : inventory.owner_id === session?.user.id
                        ? "Shared · Owner"
                        : "Shared · Member"}
                  </Text>
                </View>
              </View>
              {selected?.id === inventory.id && (
                <Ionicons
                  name="checkmark-circle"
                  color={colors.teal}
                  size={24}
                />
              )}
            </Pressable>
            {inventory.kind === "shared" && (
              <Button
                secondary
                title="Manage inventory"
                onPress={() =>
                  router.push({
                    pathname: "/inventory-manage",
                    params: { inventory: inventory.id },
                  })
                }
              />
            )}
          </View>
        ))
      )}
      <Button
        title="＋ Create shared inventory"
        onPress={() => router.push("/inventory-new")}
      />
      <Text accessibilityRole="header" style={[styles.title, { fontSize: 22 }]}>
        Invitations
      </Text>
      {problem ? <Notice text={problem} /> : null}
      {invites.isPending ? (
        <Loading />
      ) : invites.isError ? (
        <ErrorState
          text="Couldn’t load invitations."
          retry={() => void invites.refetch()}
        />
      ) : invites.data?.length ? (
        invites.data.map((i) => (
          <View key={i.id} style={styles.card}>
            <Text style={[styles.body, { fontWeight: "600" }]}>
              {i.inventory_name}
            </Text>
            <Text style={styles.small}>
              Expires {new Date(i.expires_at).toLocaleDateString()}
            </Text>
            <Button
              title="Accept invitation"
              busy={mutation.isPending && mutation.variables?.id === i.id}
              disabled={mutation.isPending}
              onPress={() => respond(i.id, true)}
            />
            <Button
              secondary
              title="Decline"
              disabled={mutation.isPending}
              onPress={() => respond(i.id, false)}
            />
          </View>
        ))
      ) : (
        <Text style={styles.subtitle}>No pending invitations.</Text>
      )}
    </Screen>
  );
}
