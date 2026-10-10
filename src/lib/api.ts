import { supabase } from "./supabase";
import type { Inventory, Item, Invitation, OwnerInvite, Person } from "./types";
import type { ItemInput } from "./validation";

async function rpc<T>(
  name: string,
  params: Record<string, unknown> = {},
): Promise<T> {
  const { data, error } = await supabase.rpc(name, params).retry(false);
  if (error) throw error;
  return data as T;
}
export const api = {
  async inventories(): Promise<Inventory[]> {
    await rpc("ensure_private_inventory");
    const { data, error } = await supabase
      .from("inventories")
      .select("*")
      .order("created_at")
      .retry(false);
    if (error) throw error;
    return data as Inventory[];
  },
  async items(inventory: string): Promise<Item[]> {
    const { data: access, error: accessError } = await supabase
      .from("inventories")
      .select("id")
      .eq("id", inventory)
      .maybeSingle()
      .retry(false);
    if (accessError) throw accessError;
    if (!access) throw { code: "42501", message: "Inventory access denied." };
    // Range pagination avoids silently truncating inventories at PostgREST's row limit.
    const all: Item[] = [];
    for (let offset = 0; ; offset += 500) {
      const { data, error } = await supabase
        .from("items")
        .select("*")
        .eq("inventory_id", inventory)
        .order("created_at")
        .order("id")
        .range(offset, offset + 499)
        .retry(false);
      if (error) throw error;
      all.push(...(data as Item[]));
      if (data.length < 500) return all;
    }
  },
  async item(id: string, inventory: string): Promise<Item> {
    const { data, error } = await supabase
      .from("items")
      .select("*")
      .eq("id", id)
      .eq("inventory_id", inventory)
      .single()
      .retry(false);
    if (error) throw error;
    return data as Item;
  },
  saveItem: (
    id: string,
    inventory: string,
    values: ItemInput,
    version: number | null,
  ) =>
    rpc<Item>("save_item", {
      p_id: id,
      p_inventory: inventory,
      p_name: values.name,
      p_quantity: values.quantity,
      p_unit: values.unit,
      p_notes: values.notes,
      p_version: version,
    }),
  deleteItem: (item: Item) =>
    rpc<void>("delete_item", {
      p_id: item.id,
      p_inventory: item.inventory_id,
      p_version: item.version,
    }),
  createInventory: (name: string) =>
    rpc<Inventory>("create_shared_inventory", { p_name: name }),
  renameInventory: (inventory: string, name: string) =>
    rpc<void>("rename_inventory", { p_inventory: inventory, p_name: name }),
  deleteInventory: (inventory: string) =>
    rpc<void>("delete_shared_inventory", { p_inventory: inventory }),
  invitations: () => rpc<Invitation[]>("pending_invitations"),
  respond: (id: string, accept: boolean) =>
    rpc<void>("respond_to_invitation", { p_invite: id, p_accept: accept }),
  people: (inventory: string) =>
    rpc<Person[]>("inventory_people", { p_inventory: inventory }),
  invite: (inventory: string, email: string) =>
    rpc<OwnerInvite>("invite_member", {
      p_inventory: inventory,
      p_email: email,
    }),
  async ownerInvites(inventory: string): Promise<OwnerInvite[]> {
    const { data, error } = await supabase
      .from("inventory_invites")
      .select("id,email,status,expires_at")
      .eq("inventory_id", inventory)
      .eq("status", "pending")
      .order("created_at")
      .retry(false);
    if (error) throw error;
    return data as OwnerInvite[];
  },
  revoke: (id: string) => rpc<void>("revoke_invitation", { p_invite: id }),
  removeMember: (inventory: string, user: string) =>
    rpc<void>("remove_member", { p_inventory: inventory, p_user: user }),
};
export function errorMessage(error: unknown): string {
  const e = error as { code?: string; message?: string };
  if (e?.code === "40001")
    return "This item changed. Reload it before trying again.";
  if (e?.code === "42501")
    return "You no longer have permission. Refresh your inventories.";
  if (e?.code === "PGRST116") return "This item is no longer available.";
  if (e?.code === "23514") return "Check your inputs and try again.";
  if (e?.code === "22023") return e.message ?? "Check your inputs.";
  if (/invalid login/i.test(e?.message ?? ""))
    return "Email or password is incorrect.";
  if (/email not confirmed/i.test(e?.message ?? ""))
    return "Confirm your email before signing in.";
  if (/rate limit|too many|security purposes/i.test(e?.message ?? ""))
    return "Too many attempts. Please wait before trying again.";
  if (/password/i.test(e?.message ?? ""))
    return "The password was not accepted. Check it and try again.";
  return "Couldn’t complete this request. Check your connection and try again.";
}
