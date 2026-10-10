import { createContext, useContext, useState, type ReactNode } from "react";
import { useQuery } from "@tanstack/react-query";
import { api } from "../lib/api";
import type { Inventory } from "../lib/types";
import { useAuth } from "../lib/auth";
const Context = createContext<{
  inventories: Inventory[];
  selected?: Inventory;
  select: (id: string) => void;
  loading: boolean;
  error: boolean;
  refresh: () => Promise<unknown>;
}>({
  inventories: [],
  select: () => {},
  loading: true,
  error: false,
  refresh: async () => {},
});
export function WorkspaceProvider({ children }: { children: ReactNode }) {
  const { session } = useAuth();
  const [id, setId] = useState("");
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
