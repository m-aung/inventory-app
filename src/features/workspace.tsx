import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Inventory } from "../lib/types";
import { useAuth } from "../lib/auth";
const Context = createContext<{
  inventories: Inventory[];
  selected?: Inventory;
  select: (id: string) => void;
  section: string;
  selectSection: (inventory: string, section: string) => void;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<unknown>;
}>({
  inventories: [],
  select: () => {},
  section: "all",
  selectSection: () => {},
  loading: true,
  error: false,
  refresh: async () => {},
});
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [id, setId] = useState("");
  const [sections, setSections] = useState<Record<string, string>>({});
  const query = useQuery({
    queryKey: ["inventories", session?.user.id],
    queryFn: api.inventories,
    enabled: !!session,
    refetchInterval: 30000,
  });
  const inventories = query.data ?? [];
  const selected =
    inventories.find((i) => i.id === id) ??
    inventories.find((i) => i.kind === "private") ??
    inventories[0];
  return (
    <Context.Provider
      value={{
        inventories,
        selected,
        select: setId,
        section: sections[selected?.id ?? ""] ?? "all",
        selectSection: (inventory, section) =>
          setSections((current) => ({ ...current, [inventory]: section })),
        loading: query.isPending,
        error: query.isError,
        refresh: query.refetch,
      }}
    >
      {children}
    </Context.Provider>
  );
}
export const useWorkspace = () => useContext(Context);
