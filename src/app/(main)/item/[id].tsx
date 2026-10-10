import { useState } from "react";
import { Text, View } from "react-native";
import { router, useLocalSearchParams } from "expo-router";
import { useQuery, useMutation } from "@tanstack/react-query";
import { Ionicons } from "@expo/vector-icons";
import { api, errorMessage } from "../../../lib/api";
import { queryClient } from "../../../lib/query";
import {
  Button,
  colors,
  ErrorState,
  Loading,
  Notice,
  Screen,
  styles,
} from "../../../components/ui";
import { useFeedback } from "../../../components/feedback";
import { useAuth } from "../../../lib/auth";
export default function Details() {
  const { id, inventory } = useLocalSearchParams<{
    id: string;
    inventory: string;
  }>();
  const { session } = useAuth();
  const { confirm, toast } = useFeedback();
  const [error, setError] = useState("");
  const query = useQuery({
    queryKey: ["item", session?.user.id, inventory, id],
    queryFn: () => api.item(id, inventory),
    refetchInterval: 15000,
  });
  const mutation = useMutation({
    mutationFn: () => api.deleteItem(query.data!),
  });
  async function remove() {
    if (
      !query.data ||
      mutation.isPending ||
      !(await confirm({
        title: `Delete ${query.data.name}?`,
        message:
          "This item will be permanently removed for everyone with access to this inventory.",
        action: "Delete item",
        danger: true,
      }))
    )
      return;
    setError("");
    try {
      await mutation.mutateAsync();
      await queryClient.invalidateQueries({ queryKey: ["items"] });
      queryClient.removeQueries({
        queryKey: ["item", session?.user.id, inventory, id],
      });
      toast("Item deleted");
      router.dismissTo("/inventory");
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  if (query.isPending)
    return (
      <Screen title="Item details">
        <Loading />
      </Screen>
    );
  if (query.isError || !query.data)
    return (
      <Screen title="Item unavailable">
        <ErrorState
          text="This item may have been removed, or your access changed."
          retry={() => void query.refetch()}
        />
      </Screen>
    );
  const item = query.data;
  return (
    <Screen title={item.name}>
      <View
        style={[styles.card, { alignItems: "center", paddingVertical: 40 }]}
      >
        <Ionicons name="cube-outline" size={48} color={colors.teal} />
        <Text style={[styles.title, { fontSize: 56 }]}>
          {Number(item.quantity).toLocaleString(undefined, {
            maximumFractionDigits: 3,
          })}
        </Text>
        <Text style={styles.body}>{item.unit}</Text>
        <Text
          style={{
            color: Number(item.quantity) > 0 ? colors.teal : colors.red,
            backgroundColor:
              Number(item.quantity) > 0 ? colors.pale : colors.redBg,
            padding: 10,
            borderRadius: 20,
          }}
        >
          {Number(item.quantity) > 0 ? "Available" : "Out of stock"}
        </Text>
      </View>
      {!!item.notes && (
        <View style={styles.card}>
          <Text style={styles.label}>Notes</Text>
          <Text style={styles.body}>{item.notes}</Text>
        </View>
      )}
      <Text style={styles.small}>
        Updated {new Date(item.updated_at).toLocaleString()}
      </Text>
      {error ? <Notice text={error} /> : null}
      <Button
        title="Edit item"
        disabled={mutation.isPending}
        onPress={() =>
          router.push({ pathname: "/item/edit", params: { id, inventory } })
        }
      />
      <Button
        title={mutation.isPending ? "Deleting…" : "Delete item"}
        busy={mutation.isPending}
        danger
        onPress={remove}
      />
    </Screen>
  );
}
