export type Inventory = {
  id: string;
  owner_id: string;
  name: string;
  kind: "private" | "shared";
  created_at: string;
};
export type Item = {
  id: string;
  inventory_id: string;
  name: string;
  quantity: number;
  unit: string;
  notes: string;
  version: number;
  created_at: string;
  updated_at: string;
};
export type Invitation = {
  id: string;
  inventory_id: string;
  inventory_name: string;
  expires_at: string;
};
export type OwnerInvite = {
  id: string;
  email: string;
  status: string;
  expires_at: string;
};
export type Person = { user_id: string; email: string; is_owner: boolean };
