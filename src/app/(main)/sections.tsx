import { router, useLocalSearchParams } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { Text, View } from "react-native";
import {
  Button,
  ErrorState,
  Loading,
  Notice,
  Screen,
  styles,
} from "../../components/ui";
import {
  SectionChoice,
  sectionsFailureMessage,
  useSections,
} from "../../features/sections";
import { useWorkspace } from "../../features/workspace";
import { useAuth } from "../../lib/auth";
import { api } from "../../lib/api";

export default function SectionsScreen() {
  const { inventory } = useLocalSearchParams<{ inventory: string }>();
  const { inventories, section, selectSection } = useWorkspace();
  const { session } = useAuth();
  const notebook = inventories.find((i) => i.id === inventory);
  const sections = useSections(notebook?.id);
  const items = useQuery({
    queryKey: ["items", session?.user.id, inventory],
    queryFn: () => api.items(inventory),
    enabled: !!notebook,
    refetchInterval: 15000,
  });
  const done = () =>
    router.canGoBack() ? router.back() : router.replace("/inventory");
  function choose(id: string) {
    selectSection(inventory, id);
    done();
  }
  const unavailable = (items.error as { code?: string })?.code === "42501";
  return (
    <Screen
      title="Sections"
      subtitle={notebook?.name}
      back={false}
      action={<Button title="Done" secondary onPress={done} />}
    >
      {!notebook || unavailable ? (
        <Notice text="Inventory unavailable. Refresh your inventories." />
      ) : sections.isPending || items.isPending ? (
        <Loading label="Loading sections…" />
      ) : sections.isError || items.isError ? (
        <ErrorState
          text={
            sections.isError
              ? sectionsFailureMessage(sections.setupRequired)
              : "Couldn’t refresh item counts."
          }
          retry={() => {
            void sections.refetch();
            void items.refetch();
          }}
        />
      ) : (
        <>
          <SectionChoice
            name="All items"
            selected={section === "all"}
            count={items.data?.length}
            onPress={() => choose("all")}
          />
          {sections.data?.map((s) => (
            <SectionChoice
              key={s.id}
              name={s.name}
              color={s.color}
              selected={section === s.id}
              count={items.data?.filter((i) => i.section_id === s.id).length}
              onPress={() => choose(s.id)}
            />
          ))}
          <SectionChoice
            name="Unsorted"
            selected={section === "unsorted"}
            count={items.data?.filter((i) => !i.section_id).length}
            onPress={() => choose("unsorted")}
          />
          {notebook.owner_id === session?.user.id && (
            <View style={{ gap: 12, marginTop: 12 }}>
              <Button
                title="Add section"
                onPress={() =>
                  router.push({
                    pathname: "/section-edit",
                    params: { inventory },
                  })
                }
              />
              <Text accessibilityRole="header" style={styles.label}>
                Manage sections
              </Text>
              {sections.data?.map((s) => (
                <Button
                  key={s.id}
                  secondary
                  title={`Manage ${s.name}`}
                  onPress={() =>
                    router.push({
                      pathname: "/section-edit",
                      params: { inventory, id: s.id },
                    })
                  }
                />
              ))}
              {!sections.data?.length && (
                <Text style={styles.small}>
                  Add your first section to organize this notebook.
                </Text>
              )}
            </View>
          )}
        </>
      )}
    </Screen>
  );
}
