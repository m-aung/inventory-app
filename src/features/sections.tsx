import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Pressable, Text, View } from "react-native";
import { useAuth } from "../lib/auth";
import { api } from "../lib/api";
import { colors, styles } from "../components/ui";
import { queryClient } from "../lib/query";

export function useSections(inventory?: string) {
  const { session } = useAuth();
  const userId = session?.user.id;
  const key = `${userId ?? ""}:${inventory ?? ""}`;
  const [failure, setFailure] = useState<{ key: string; error: Error } | null>(
    () => {
      const error = queryClient.getQueryState<unknown, Error>([
        "sections",
        userId,
        inventory,
      ])?.error;
      return error ? { key, error } : null;
    },
  );
  const previousError = failure?.key === key ? failure.error : null;
  const query = useQuery({
    queryKey: ["sections", session?.user.id, inventory],
    queryFn: () => api.sections(inventory!),
    enabled: !!inventory && !!session,
    retry: (count, error) => !sectionsBackendUnavailable(error) && count < 1,
    refetchInterval: (state) =>
      sectionsBackendUnavailable(state.state.error ?? previousError)
        ? false
        : 15000,
    refetchOnWindowFocus: (state) =>
      sectionsBackendUnavailable(state.state.error ?? previousError)
        ? false
        : "always",
  });
  useEffect(
    () =>
      queryClient.getQueryCache().subscribe((event) => {
        if (
          event.type !== "updated" ||
          (event.action.type !== "error" && event.action.type !== "success")
        )
          return;
        const queryKey = event.query.queryKey;
        if (
          queryKey[0] !== "sections" ||
          queryKey[1] !== userId ||
          queryKey[2] !== inventory
        )
          return;
        const state = event.query.state;
        if (state.status === "error" && state.error)
          setFailure((previous) =>
            previous?.key === key && previous.error === state.error
              ? previous
              : { key, error: state.error! },
          );
        else if (state.status === "success") setFailure(null);
      }),
    [key, userId, inventory],
  );
  // Initial failures briefly return to pending on refetch. Keep the notice visible
  // until a successful response, rather than making the layout jump on every poll.
  const error = query.isSuccess ? null : (query.error ?? previousError);
  return {
    ...query,
    error,
    isError: !!error,
    isPending: query.isPending && !error,
    setupRequired: sectionsBackendUnavailable(error),
  };
}
export function sectionsBackendUnavailable(error: unknown) {
  return [
    "PGRST205",
    "PGRST204",
    "PGRST202",
    "42P01",
    "42703",
    "42883",
  ].includes((error as { code?: string } | null)?.code ?? "");
}
export function sectionsFailureMessage(setupRequired: boolean) {
  return setupRequired
    ? "Sections aren’t available on the server yet. Please try again after the app setup is completed."
    : "Couldn’t refresh sections. Your last loaded sections are kept. Pull to refresh to try again.";
}
export async function refreshSectionItems() {
  await Promise.all([
    queryClient.invalidateQueries({ queryKey: ["sections"] }),
    queryClient.invalidateQueries({ queryKey: ["items"] }),
    queryClient.invalidateQueries({ queryKey: ["item"] }),
  ]);
}
export function SectionChoice({
  name,
  color = colors.muted,
  selected,
  onPress,
  count,
  disabled = false,
}: {
  name: string;
  color?: string;
  selected: boolean;
  onPress: () => void;
  count?: number;
  disabled?: boolean;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`Section ${name}`}
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => ({
        minHeight: 56,
        padding: 16,
        borderRadius: 14,
        borderLeftWidth: 5,
        borderLeftColor: color,
        backgroundColor: selected ? colors.pale : colors.card,
        opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
      })}
    >
      <View style={styles.between}>
        <Text style={[styles.body, { flex: 1, fontWeight: "600" }]}>
          {name}
        </Text>
        {selected && (
          <Text accessibilityLabel="Selected" style={styles.link}>
            ✓
          </Text>
        )}
        {count !== undefined && (
          <Text style={styles.small}>{count.toLocaleString()}</Text>
        )}
      </View>
    </Pressable>
  );
}
