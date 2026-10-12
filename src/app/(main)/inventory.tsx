import { useEffect, useMemo, useState } from "react";
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  RefreshControl,
  Text,
  TextInput,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { router } from "expo-router";
import { useQuery } from "@tanstack/react-query";
import { useWorkspace } from "../../features/workspace";
import { useAuth } from "../../lib/auth";
import { QuantityControls } from "../../features/quantity-controls";
import { sectionsFailureMessage, useSections } from "../../features/sections";
import { api } from "../../lib/api";
import type { Item } from "../../lib/types";
import {
  Button,
  colors,
  ErrorState,
  Notice,
  Skeleton,
  styles,
} from "../../components/ui";

export default function InventoryScreen() {
  const {
    selected,
    inventories,
    loading,
    error,
    refresh,
    section,
    selectSection,
  } = useWorkspace();
  const sections = useSections(selected?.id);
  const activeSection = sections.data?.find((s) => s.id === section);
  const sectionMissing =
    section !== "all" &&
    section !== "unsorted" &&
    sections.isSuccess &&
    !activeSection;
  const currentSection = sectionMissing ? "all" : section;
  useEffect(() => {
    if (sectionMissing && selected) selectSection(selected.id, "all");
  }, [sectionMissing, selected, selectSection]);
  const sectionName =
    currentSection === "all"
      ? "All items"
      : currentSection === "unsorted"
        ? "Unsorted"
        : (activeSection?.name ?? "Loading section…");
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Available" | "Out of stock">(
    "All",
  );
  const [refreshing, setRefreshing] = useState(false);
  const [editingItems, setEditingItems] = useState<Record<string, Item>>({});
  const query = useQuery({
    queryKey: ["items", session?.user.id, selected?.id],
    queryFn: () => api.items(selected!.id),
    enabled: !!selected,
    refetchInterval: 15000,
  });
  const data = useMemo(() => query.data ?? [], [query.data]);
  const selectedInventoryId = selected?.id;
  const visible = useMemo(
    () =>
      [
        ...data,
        ...Object.values(editingItems).filter(
          (item) =>
            item.inventory_id === selectedInventoryId &&
            !data.some((entry) => entry.id === item.id),
        ),
      ]
        .filter(
          (item) =>
            (editingItems[item.id] &&
              item.inventory_id === selectedInventoryId) ||
            (item.name
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase().trim()) &&
              (currentSection === "all" ||
                (currentSection === "unsorted"
                  ? !item.section_id
                  : item.section_id === currentSection)) &&
              (filter === "All" ||
                (filter === "Available"
                  ? Number(item.quantity) > 0
                  : Number(item.quantity) === 0))),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data, search, filter, currentSection, editingItems, selectedInventoryId],
  );
  async function reload() {
    setRefreshing(true);
    try {
      await refresh();
      await query.refetch();
      await sections.refetch();
    } finally {
      setRefreshing(false);
    }
  }
  const accessDenied =
    (query.error as { code?: string } | null)?.code === "42501";
  const initialError =
    accessDenied ||
    (error && !inventories.length) ||
    (query.isError && !query.data);
  const initialLoading = loading || (!!selected && query.isPending);
  const heading = (
    <View style={{ gap: 20, marginBottom: 20 }}>
      <View style={styles.between}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${selected?.name ?? "Choose inventory"} ▾`}
          accessibilityState={{
            disabled: Object.keys(editingItems).length > 0,
          }}
          disabled={Object.keys(editingItems).length > 0}
          onPress={() => router.push("/inventories")}
          style={{ flex: 1, minHeight: 44, justifyContent: "center" }}
        >
          <View style={styles.row}>
            <Text style={[styles.body, { fontWeight: "600", flexShrink: 1 }]}>
              {selected?.name ?? "Choose inventory"}
            </Text>
            <Ionicons name="chevron-down" size={18} color={colors.ink} />
          </View>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
          style={{
            padding: 12,
            borderRadius: 24,
            backgroundColor: colors.card,
          }}
        >
          <Ionicons name="settings-outline" color={colors.ink} size={24} />
        </Pressable>
      </View>
      {Object.keys(editingItems).length > 0 && (
        <Text style={styles.small}>
          Save or cancel your amount edit before switching notebooks.
        </Text>
      )}
      <Pressable
        accessibilityRole="button"
        accessibilityLabel="Open sections"
        disabled={!selected}
        onPress={() =>
          router.push({
            pathname: "/sections",
            params: { inventory: selected!.id },
          })
        }
        style={[styles.between, styles.input]}
      >
        <View style={[styles.row, { flex: 1 }]}>
          <View
            style={{
              width: 9,
              height: 9,
              borderRadius: 5,
              backgroundColor: activeSection?.color ?? colors.muted,
            }}
          />
          <Text style={[styles.body, { flex: 1, fontWeight: "600" }]}>
            {sectionName}
          </Text>
        </View>
        <Text style={styles.link}>Sections</Text>
      </Pressable>
      {sections.isError && (
        <Notice text={sectionsFailureMessage(sections.setupRequired)} />
      )}
      {!initialLoading && !initialError && selected && (
        <View
          style={{
            backgroundColor: colors.hero,
            borderRadius: 24,
            padding: 24,
            gap: 12,
          }}
        >
          <Text
            style={{ color: colors.heroMuted, fontSize: 13, letterSpacing: 1 }}
          >
            TOTAL ITEM RECORDS
          </Text>
          <Text
            testID="inventory-total"
            style={{
              color: colors.heroText,
              fontSize: 56,
              fontWeight: "500",
              letterSpacing: -2,
              fontVariant: ["tabular-nums"],
            }}
          >
            {data.length.toLocaleString()}
          </Text>
          <View
            style={{
              flexDirection: "row",
              flexWrap: "wrap",
              gap: 24,
              borderTopWidth: 1,
              borderTopColor: colors.heroLine,
              paddingTop: 16,
            }}
          >
            <View style={{ gap: 4 }}>
              <Text
                testID="inventory-available"
                style={{
                  color: colors.heroText,
                  fontSize: 20,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {data
                  .filter((i) => Number(i.quantity) > 0)
                  .length.toLocaleString()}
              </Text>
              <Text style={{ color: colors.heroMuted, fontSize: 13 }}>
                Available
              </Text>
            </View>
            <View style={{ gap: 4 }}>
              <Text
                testID="inventory-out-of-stock"
                style={{
                  color: colors.heroText,
                  fontSize: 20,
                  fontVariant: ["tabular-nums"],
                }}
              >
                {data
                  .filter((i) => Number(i.quantity) === 0)
                  .length.toLocaleString()}
              </Text>
              <Text style={{ color: colors.heroMuted, fontSize: 13 }}>
                Out of stock
              </Text>
            </View>
          </View>
        </View>
      )}
      <View style={[styles.row, styles.input]}>
        <Ionicons name="search-outline" size={20} color={colors.muted} />
        <TextInput
          accessibilityLabel="Search items"
          placeholder="Search items…"
          placeholderTextColor={colors.muted}
          value={search}
          onChangeText={setSearch}
          style={{ flex: 1, fontSize: 16, color: colors.ink }}
        />
        {!!search && (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel="Clear search"
            onPress={() => setSearch("")}
            style={{ padding: 8 }}
          >
            <Ionicons
              name="close-circle-outline"
              size={20}
              color={colors.muted}
            />
          </Pressable>
        )}
      </View>
      <View style={[styles.row, { flexWrap: "wrap", gap: 8 }]}>
        {(["All", "Available", "Out of stock"] as const).map((label) => (
          <Pressable
            key={label}
            accessibilityRole="button"
            accessibilityState={{ selected: label === filter }}
            onPress={() => setFilter(label)}
            style={{
              minHeight: 44,
              paddingHorizontal: 14,
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: label === filter ? colors.ink : colors.bg,
            }}
          >
            <Text
              style={{
                color: label === filter ? "#fff" : colors.ink,
                fontWeight: "600",
              }}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>
      <View style={styles.between}>
        <Text
          accessibilityRole="header"
          style={[styles.body, { fontWeight: "600" }]}
        >
          Items
        </Text>
        {!initialLoading && !initialError && (
          <Text style={styles.small}>{visible.length} in this view</Text>
        )}
      </View>
      {!accessDenied &&
      ((query.isError && query.data) || (error && inventories.length > 0)) ? (
        <Notice text="Couldn’t refresh. Showing previously loaded items." />
      ) : null}
    </View>
  );
  return (
    <SafeAreaView style={styles.page}>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={
          Platform.OS === "ios"
            ? "padding"
            : Platform.OS === "android"
              ? "height"
              : undefined
        }
      >
        <FlatList
          data={initialError || initialLoading ? [] : visible}
          keyExtractor={(i) => i.id}
          contentContainerStyle={{
            padding: 22,
            paddingBottom: 16,
            maxWidth: 640,
            width: "100%",
            alignSelf: "center",
            flexGrow: 1,
          }}
          keyboardShouldPersistTaps="handled"
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={reload}
              tintColor={colors.teal}
            />
          }
          ListHeaderComponent={heading}
          renderItem={({ item, index }) => (
            <View
              style={{
                backgroundColor: colors.card,
                padding: 16,
                gap: 10,
                borderTopLeftRadius: index === 0 ? 20 : 0,
                borderTopRightRadius: index === 0 ? 20 : 0,
                borderBottomLeftRadius: index === visible.length - 1 ? 20 : 0,
                borderBottomRightRadius: index === visible.length - 1 ? 20 : 0,
                borderBottomWidth: index === visible.length - 1 ? 0 : 1,
                borderBottomColor: colors.line,
              }}
            >
              <Pressable
                accessibilityRole="button"
                accessibilityLabel={`${item.name}, ${item.quantity} ${item.unit}${Number(item.quantity) === 0 ? ", out of stock" : ""}`}
                onPress={() =>
                  router.push({
                    pathname: "/item/[id]",
                    params: { id: item.id, inventory: item.inventory_id },
                  })
                }
                style={styles.between}
              >
                <View style={[styles.row, { flex: 1 }]}>
                  <View style={{ flex: 1 }}>
                    <Text style={[styles.body, { fontWeight: "600" }]}>
                      {item.name}
                    </Text>
                    <Text
                      style={
                        Number(item.quantity) === 0
                          ? styles.error
                          : styles.small
                      }
                    >
                      {Number(item.quantity) === 0
                        ? "Out of stock"
                        : "Available"}
                    </Text>
                  </View>
                </View>
                <Ionicons
                  name="chevron-forward"
                  size={18}
                  color={colors.muted}
                />
              </Pressable>
              <QuantityControls
                item={item}
                onDraftChange={(entry, editing) =>
                  setEditingItems((current) => {
                    const next = { ...current };
                    if (editing) next[entry.id] = entry;
                    else delete next[entry.id];
                    return next;
                  })
                }
              />
            </View>
          )}
          ListEmptyComponent={
            initialError ? (
              <ErrorState
                text={
                  accessDenied
                    ? "You no longer have access to this inventory. Refresh your inventories."
                    : "Couldn’t load your items. Check your connection and try again."
                }
                retry={reload}
              />
            ) : initialLoading ? (
              <Skeleton />
            ) : (
              <View
                style={{ alignItems: "center", gap: 12, paddingVertical: 48 }}
              >
                <Ionicons
                  name="file-tray-outline"
                  color={colors.muted}
                  size={54}
                />
                <Text style={[styles.body, { fontWeight: "600" }]}>
                  {data.length
                    ? "No items match your search"
                    : "Your inventory starts here"}
                </Text>
                <Text style={[styles.subtitle, { textAlign: "center" }]}>
                  {data.length
                    ? "Try a different search or availability filter."
                    : "Add your first item to keep track of what you have."}
                </Text>
                {data.length > 0 && (
                  <Button
                    secondary
                    title="Clear search and filters"
                    onPress={() => {
                      setSearch("");
                      setFilter("All");
                      if (selected) selectSection(selected.id, "all");
                    }}
                  />
                )}
              </View>
            )
          }
        />
        <View
          style={{
            paddingHorizontal: 22,
            paddingTop: 8,
            paddingBottom: 12,
            width: "100%",
            maxWidth: 640,
            alignSelf: "center",
          }}
        >
          <Button
            title="＋ Add item"
            disabled={!selected || initialError}
            onPress={() =>
              router.push({
                pathname: "/item/new",
                params: {
                  inventory: selected!.id,
                  section:
                    currentSection === "all" || currentSection === "unsorted"
                      ? ""
                      : currentSection,
                },
              })
            }
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
