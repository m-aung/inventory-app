import { useLocalSearchParams } from "expo-router";
import { ItemEditor } from "../../../features/item-editor";
import { useWorkspace } from "../../../features/workspace";
import { ErrorState, Loading, Screen } from "../../../components/ui";
export default function AddItem() {
  const { inventory } = useLocalSearchParams<{ inventory: string }>();
  const { inventories, loading, refresh } = useWorkspace();
  if (loading)
    return (
      <Screen>
        <Loading />
      </Screen>
    );
  if (!inventories.some((i) => i.id === inventory))
    return (
      <Screen>
        <ErrorState
          text="Inventory unavailable. Refresh your access."
          retry={() => void refresh()}
        />
      </Screen>
    );
  return <ItemEditor inventory={inventory} />;
}
