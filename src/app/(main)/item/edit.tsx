import { useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { ItemEditor } from "../../../features/item-editor";
import { api } from "../../../lib/api";
import { useAuth } from "../../../lib/auth";
import { ErrorState, Loading, Screen } from "../../../components/ui";
export default function EditItem() {
  const { id, inventory } = useLocalSearchParams<{
    id: string;
    inventory: string;
  }>();
  const { session } = useAuth();
  const query = useQuery({
    queryKey: ["item", session?.user.id, inventory, id],
    queryFn: () => api.item(id, inventory),
    staleTime: 0,
  });
  if (query.isPending)
    return (
      <Screen title="Edit item">
        <Loading />
      </Screen>
    );
  if (query.isError || !query.data)
    return (
      <Screen>
        <ErrorState
          text="Couldn’t load this item."
          retry={() => void query.refetch()}
        />
      </Screen>
    );
  return <ItemEditor key={id} inventory={inventory} initial={query.data} />;
}
