import { useState } from "react";
import { router } from "expo-router";
import { useMutation } from "@tanstack/react-query";
import { api, errorMessage } from "../../lib/api";
import { inventoryNameSchema } from "../../lib/validation";
import { useWorkspace } from "../../features/workspace";
import { useFeedback } from "../../components/feedback";
import { Button, Field, Notice, Screen } from "../../components/ui";
export default function CreateInventory() {
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const { select, refresh } = useWorkspace();
  const { toast } = useFeedback();
  const mutation = useMutation({
    mutationFn: () => api.createInventory(inventoryNameSchema.parse(name)),
  });
  async function create() {
    if (mutation.isPending) return;
    const parsed = inventoryNameSchema.safeParse(name);
    if (!parsed.success) {
      setError(parsed.error.issues[0].message);
      return;
    }
    setError("");
    try {
      const inventory = await mutation.mutateAsync();
      await refresh();
      select(inventory.id);
      toast("Shared inventory created");
      router.replace({
        pathname: "/inventory-manage",
        params: { inventory: inventory.id },
      });
    } catch (e) {
      setError(errorMessage(e));
    }
  }
  return (
    <Screen
      title="Create shared inventory"
      subtitle="You’ll be the owner. Invite family or team members after creating it."
    >
      <Field
        label="Inventory name"
        value={name}
        onChangeText={setName}
        maxLength={80}
        placeholder="e.g. Our household"
        editable={!mutation.isPending}
      />
      {error ? <Notice text={error} /> : null}
      <Button
        title={mutation.isPending ? "Creating…" : "Create inventory"}
        busy={mutation.isPending}
        onPress={create}
      />
    </Screen>
  );
}
