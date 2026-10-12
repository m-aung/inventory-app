import { useLocalSearchParams } from "expo-router";
import { ErrorState, Loading, Notice, Screen } from "../../components/ui";
import { useWorkspace } from "../../features/workspace";
import { sectionsFailureMessage, useSections } from "../../features/sections";
import { SectionEditor } from "../../features/section-editor";
import { useAuth } from "../../lib/auth";

export default function EditSectionScreen() {
  const { inventory, id } = useLocalSearchParams<{
    inventory: string;
    id?: string;
  }>();
  const { inventories, loading } = useWorkspace();
  const { session } = useAuth();
  const notebook = inventories.find((i) => i.id === inventory);
  const sections = useSections(notebook?.id);
  if (loading)
    return (
      <Screen title="Section">
        <Loading />
      </Screen>
    );
  if (!notebook || notebook.owner_id !== session?.user.id)
    return (
      <Screen title="Section">
        <Notice text="Only the inventory owner can manage sections." />
      </Screen>
    );
  if (sections.isPending)
    return (
      <Screen title="Section">
        <Loading />
      </Screen>
    );
  if (sections.isError && !sections.data)
    return (
      <Screen title="Section">
        <ErrorState
          text={sectionsFailureMessage(sections.setupRequired)}
          retry={() => void sections.refetch()}
        />
      </Screen>
    );
  return (
    <SectionEditor
      key={`${inventory}:${id ?? "new"}`}
      inventory={inventory}
      id={id}
      initial={sections.data?.find((s) => s.id === id)}
    />
  );
}
