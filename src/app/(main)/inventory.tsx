import { useMemo, useState } from "react";
import {
  FlatList,
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
import { api } from "../../lib/api";
import {
  Button,
  colors,
  ErrorState,
  Notice,
  Skeleton,
  styles,
} from "../../components/ui";

export default function InventoryScreen() {
  const { selected, inventories, loading, error, refresh } = useWorkspace();
  const { session } = useAuth();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<"All" | "Available" | "Out of stock">(
    "All",
  );
  const [refreshing, setRefreshing] = useState(false);
  const query = useQuery({
    queryKey: ["items", session?.user.id, selected?.id],
    queryFn: () => api.items(selected!.id),
    enabled: !!selected,
    refetchInterval: 15000,
  });
  const data = useMemo(() => query.data ?? [], [query.data]);
  const visible = useMemo(
    () =>
      data
        .filter(
          (item) =>
            item.name
              .toLocaleLowerCase()
              .includes(search.toLocaleLowerCase().trim()) &&
            (filter === "All" ||
              (filter === "Available"
                ? Number(item.quantity) > 0
                : Number(item.quantity) === 0)),
        )
        .sort((a, b) => a.name.localeCompare(b.name)),
    [data, search, filter],
  );
  async function reload() {
    setRefreshing(true);
    try {
      await refresh();
      await query.refetch();
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
        <View style={styles.row}>
          <Ionicons name="cube-outline" color={colors.teal} size={24} />
          <Text style={styles.label}>Inventory</Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Settings"
          onPress={() => router.push("/settings")}
          style={{ padding: 10 }}
        >
          <Ionicons name="settings-outline" color={colors.ink} size={24} />
        </Pressable>
      </View>
      <View>
        <Text accessibilityRole="header" style={styles.title}>
          Your inventory
        </Text>
        <Text style={[styles.subtitle, { marginTop: 6 }]}>
          Everything you have, in one place.
        </Text>
      </View>
      <Button
        secondary
        title={`${selected?.name ?? "Choose inventory"} ▾`}
        onPress={() => router.push("/inventories")}
      />
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
              paddingHorizontal: 16,
              justifyContent: "center",
              borderRadius: 12,
              backgroundColor: label === filter ? colors.teal : colors.line,
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
      {!initialLoading && !initialError && (
        <View style={styles.row}>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={[styles.title, { fontSize: 26 }]}>{data.length}</Text>
            <Text style={styles.small}>Items</Text>
          </View>
          <View style={[styles.card, { flex: 1 }]}>
            <Text style={[styles.title, { fontSize: 26 }]}>
              {data.filter((i) => Number(i.quantity) === 0).length}
            </Text>
            <Text style={styles.small}>Out of stock</Text>
          </View>
        </View>
      )}
      {!accessDenied &&
      ((query.isError && query.data) || (error && inventories.length > 0)) ? (
        <Notice text="Couldn’t refresh. Showing previously loaded items." />
      ) : null}
    </View>
  );
  return (
    <SafeAreaView style={styles.page}>
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
        ItemSeparatorComponent={() => <View style={{ height: 10 }} />}
        renderItem={({ item }) => (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${item.name}, ${item.quantity} ${item.unit}${Number(item.quantity) === 0 ? ", out of stock" : ""}`}
            onPress={() =>
              router.push({
                pathname: "/item/[id]",
                params: { id: item.id, inventory: item.inventory_id },
              })
            }
            style={[styles.card, styles.between]}
          >
            <View style={[styles.row, { flex: 1 }]}>
              <View
                style={{
                  backgroundColor: colors.pale,
                  padding: 12,
                  borderRadius: 12,
                }}
              >
                <Ionicons name="cube-outline" color={colors.teal} size={22} />
              </View>
              <View style={{ flex: 1 }}>
                <Text style={[styles.body, { fontWeight: "600" }]}>
                  {item.name}
                </Text>
                {Number(item.quantity) === 0 && (
                  <Text style={styles.error}>Out of stock</Text>
                )}
              </View>
            </View>
            <View style={{ alignItems: "flex-end" }}>
              <Text style={[styles.body, { fontWeight: "700", fontSize: 22 }]}>
                {Number(item.quantity).toLocaleString(undefined, {
                  maximumFractionDigits: 3,
                })}
              </Text>
              <Text style={styles.small}>{item.unit}</Text>
            </View>
          </Pressable>
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
              params: { inventory: selected!.id },
            })
          }
        />
      </View>
    </SafeAreaView>
  );
}
