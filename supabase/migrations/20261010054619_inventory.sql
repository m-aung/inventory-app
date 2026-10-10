-- Day-1 schema. All management mutations go through authenticated RPCs.
begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.inventories (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80),
  kind text not null check (kind in ('private','shared')),
  created_at timestamptz not null default now()
);
create unique index one_private_inventory on public.inventories(owner_id) where kind = 'private';
create table public.inventory_members (
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  joined_at timestamptz not null default now(),
  primary key (inventory_id,user_id)
);
create index members_by_user on public.inventory_members(user_id);
create table public.items (
  id uuid primary key,
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  -- Unconstrained numeric rejects excess precision rather than silently rounding.
  quantity numeric not null check (quantity >= 0 and quantity <= 999999 and quantity = round(quantity,3)),
  unit text not null check (unit in ('pcs','bottles','bags','boxes','kg','g','L','mL')),
  notes text not null default '' check (char_length(notes) <= 500),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index items_by_inventory on public.items(inventory_id,created_at,id);
create table public.inventory_invites (
  id uuid primary key default gen_random_uuid(),
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  email text not null check (char_length(email) <= 254 and email = lower(btrim(email)) and email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'),
  status text not null default 'pending' check (status in ('pending','accepted','declined','revoked')),
  expires_at timestamptz not null default now() + interval '7 days',
  created_at timestamptz not null default now()
);
create unique index one_pending_invite on public.inventory_invites(inventory_id,email) where status = 'pending';
create index invites_by_email on public.inventory_invites(email,status);

create function private.viewer_email() returns text
language sql stable security definer set search_path = '' as $$
  select lower(email) from auth.users where id = auth.uid() and email_confirmed_at is not null
$$;
create function private.can_access(p_inventory uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.inventories i where i.id = p_inventory and
    (i.owner_id = auth.uid() or (i.kind = 'shared' and exists(
      select 1 from public.inventory_members m where m.inventory_id = i.id and m.user_id = auth.uid()))))
$$;
create function private.is_owner(p_inventory uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists(select 1 from public.inventories where id = p_inventory and owner_id = auth.uid())
$$;
create function private.require_user() returns uuid
language plpgsql stable security definer set search_path = '' as $$
begin
  if auth.uid() is null or not exists(select 1 from auth.users where id = auth.uid() and email_confirmed_at is not null) then
    raise exception 'Sign in with a verified email first.' using errcode = '42501';
  end if;
  return auth.uid();
end $$;
revoke all on all functions in schema private from public,anon;
grant execute on function private.can_access(uuid),private.is_owner(uuid),private.viewer_email() to authenticated;

alter table public.inventories enable row level security;
alter table public.inventory_members enable row level security;
alter table public.items enable row level security;
alter table public.inventory_invites enable row level security;
create policy inventory_read on public.inventories for select to authenticated using (private.can_access(id));
create policy members_read on public.inventory_members for select to authenticated using (private.can_access(inventory_id));
create policy items_read on public.items for select to authenticated using (private.can_access(inventory_id));
create policy invites_read on public.inventory_invites for select to authenticated using
  (private.is_owner(inventory_id) or email = private.viewer_email());
revoke all on public.inventories,public.inventory_members,public.items,public.inventory_invites from anon,authenticated;
grant select on public.inventories,public.inventory_members,public.items,public.inventory_invites to authenticated;

create function public.ensure_private_inventory() returns public.inventories
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.inventories;
begin
  insert into public.inventories(owner_id,name,kind) values(v_user,'My inventory','private')
    on conflict (owner_id) where kind = 'private' do nothing;
  select * into v_row from public.inventories where owner_id = v_user and kind = 'private';
  return v_row;
end $$;
create function public.create_shared_inventory(p_name text) returns public.inventories
language plpgsql security definer set search_path = '' as $$
declare v_user uuid := private.require_user(); v_row public.inventories;
begin
  insert into public.inventories(owner_id,name,kind) values(v_user,btrim(p_name),'shared') returning * into v_row;
  return v_row;
end $$;
create function public.rename_inventory(p_inventory uuid,p_name text) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  update public.inventories set name = btrim(p_name) where id = p_inventory and owner_id = auth.uid() and kind = 'shared';
  if not found then raise exception 'Only the owner can rename a shared inventory.' using errcode = '42501'; end if;
end $$;
create function public.delete_shared_inventory(p_inventory uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  delete from public.inventories where id = p_inventory and owner_id = auth.uid() and kind = 'shared';
  if not found then raise exception 'Only the owner can delete a shared inventory.' using errcode = '42501'; end if;
end $$;

create function public.save_item(p_id uuid,p_inventory uuid,p_name text,p_quantity numeric,p_unit text,p_notes text,p_version integer default null)
returns public.items language plpgsql security definer set search_path = '' as $$
declare v_row public.items;
begin
  perform private.require_user();
  perform 1 from public.inventories where id = p_inventory for update;
  if not private.can_access(p_inventory) then raise exception 'Inventory access denied.' using errcode = '42501'; end if;
  if p_version is null then
    insert into public.items(id,inventory_id,name,quantity,unit,notes)
      values(p_id,p_inventory,btrim(p_name),p_quantity,p_unit,coalesce(p_notes,'')) on conflict(id) do nothing returning * into v_row;
    if v_row.id is null then
      select * into v_row from public.items where id = p_id and inventory_id = p_inventory;
      if v_row.id is null or v_row.name is distinct from btrim(p_name) or v_row.quantity is distinct from p_quantity
        or v_row.unit is distinct from p_unit or v_row.notes is distinct from coalesce(p_notes,'') then
        raise exception 'This request already saved different values. Reload the item.' using errcode = '40001';
      end if;
    end if;
  else
    update public.items set name = btrim(p_name),quantity = p_quantity,unit = p_unit,notes = coalesce(p_notes,''),
      version = version + 1,updated_at = now() where id = p_id and inventory_id = p_inventory and version = p_version returning * into v_row;
    if v_row.id is null then
      -- A response can be lost after a successful update. Treat only the exact next version/payload as a retry.
      select * into v_row from public.items where id = p_id and inventory_id = p_inventory;
      if v_row.id is null or v_row.version <> p_version + 1 or v_row.name is distinct from btrim(p_name)
        or v_row.quantity is distinct from p_quantity or v_row.unit is distinct from p_unit or v_row.notes is distinct from coalesce(p_notes,'') then
        raise exception 'This item changed. Reload it before saving.' using errcode = '40001';
      end if;
    end if;
  end if;
  return v_row;
end $$;
create function public.delete_item(p_id uuid,p_inventory uuid,p_version integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform 1 from public.inventories where id = p_inventory for update;
  if not private.can_access(p_inventory) then raise exception 'Inventory access denied.' using errcode = '42501'; end if;
  delete from public.items where id = p_id and inventory_id = p_inventory and version = p_version;
  if not found and exists(select 1 from public.items where id = p_id and inventory_id = p_inventory) then
    raise exception 'This item changed. Reload it before deleting.' using errcode = '40001';
  end if;
end $$;

create function public.invite_member(p_inventory uuid,p_email text) returns public.inventory_invites
language plpgsql security definer set search_path = '' as $$
declare v_row public.inventory_invites; v_email text := lower(btrim(p_email));
begin
  perform private.require_user();
  perform 1 from public.inventories where id = p_inventory and kind = 'shared' and owner_id = auth.uid() for update;
  if not found then raise exception 'Only the owner can invite members.' using errcode = '42501'; end if;
  if exists(select 1 from auth.users u where lower(u.email) = v_email and (u.id = auth.uid() or exists(
    select 1 from public.inventory_members m where m.inventory_id = p_inventory and m.user_id = u.id))) then
    raise exception 'This person already has access.' using errcode = '22023';
  end if;
  insert into public.inventory_invites(inventory_id,email) values(p_inventory,v_email)
    on conflict(inventory_id,email) where status = 'pending' do update set expires_at = now() + interval '7 days'
    returning * into v_row;
  return v_row;
end $$;
create function public.pending_invitations() returns table(id uuid,inventory_id uuid,inventory_name text,expires_at timestamptz)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  return query select v.id,v.inventory_id,i.name,v.expires_at from public.inventory_invites v
    join public.inventories i on i.id = v.inventory_id where v.email = private.viewer_email()
    and v.status = 'pending' and v.expires_at > now() and i.kind = 'shared';
end $$;
create function public.respond_to_invitation(p_invite uuid,p_accept boolean) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inv public.inventory_invites; v_inventory uuid;
begin
  perform private.require_user();
  select inventory_id into v_inventory from public.inventory_invites where id = p_invite and email = private.viewer_email();
  perform 1 from public.inventories where id = v_inventory and kind = 'shared' for update;
  if not found then raise exception 'Invitation unavailable.' using errcode = '42501'; end if;
  select * into v_inv from public.inventory_invites where id = p_invite and email = private.viewer_email()
    and status = 'pending' and expires_at > now() for update;
  if not found then raise exception 'Invitation unavailable or expired.' using errcode = '42501'; end if;
  if p_accept then insert into public.inventory_members(inventory_id,user_id) values(v_inv.inventory_id,auth.uid()) on conflict do nothing; end if;
  update public.inventory_invites set status = case when p_accept then 'accepted' else 'declined' end where id = p_invite;
end $$;
create function public.revoke_invitation(p_invite uuid) returns void
language plpgsql security definer set search_path = '' as $$
declare v_inventory uuid;
begin
  perform private.require_user();
  select inventory_id into v_inventory from public.inventory_invites where id = p_invite;
  perform 1 from public.inventories where id = v_inventory and owner_id = auth.uid() for update;
  if not found then raise exception 'Only the owner can revoke invitations.' using errcode = '42501'; end if;
  update public.inventory_invites set status = 'revoked' where id = p_invite and status = 'pending';
end $$;
create function public.inventory_people(p_inventory uuid) returns table(user_id uuid,email text,is_owner boolean)
language plpgsql stable security definer set search_path = '' as $$
begin
  perform private.require_user();
  if not private.can_access(p_inventory) then raise exception 'Inventory access denied.' using errcode = '42501'; end if;
  return query select u.id,u.email::text,true from public.inventories i join auth.users u on u.id = i.owner_id where i.id = p_inventory
    union all select u.id,u.email::text,false from public.inventory_members m join auth.users u on u.id = m.user_id where m.inventory_id = p_inventory;
end $$;
create function public.remove_member(p_inventory uuid,p_user uuid) returns void
language plpgsql security definer set search_path = '' as $$
begin
  perform private.require_user();
  perform 1 from public.inventories where id = p_inventory for update;
  if not private.is_owner(p_inventory) and p_user <> auth.uid() then
    raise exception 'Only the owner can remove another member.' using errcode = '42501';
  end if;
  delete from public.inventory_members where inventory_id = p_inventory and user_id = p_user;
end $$;

-- Account deletion must not silently destroy a family's/team's inventory.
create function private.protect_owned_shared_inventory() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if exists(select 1 from public.inventories where owner_id = old.id and kind = 'shared') then
    raise exception 'Delete your owned shared inventories before deleting your account.' using errcode = '23503';
  end if;
  return old;
end $$;
create trigger protect_shared_before_account_delete before delete on auth.users
for each row execute function private.protect_owned_shared_inventory();

-- PostgreSQL grants EXECUTE to PUBLIC by default: explicitly close every new RPC.
revoke all on function public.ensure_private_inventory(),public.create_shared_inventory(text),public.rename_inventory(uuid,text),
  public.delete_shared_inventory(uuid),public.save_item(uuid,uuid,text,numeric,text,text,integer),public.delete_item(uuid,uuid,integer),
  public.invite_member(uuid,text),public.pending_invitations(),public.respond_to_invitation(uuid,boolean),public.revoke_invitation(uuid),
  public.inventory_people(uuid),public.remove_member(uuid,uuid) from public,anon;
grant execute on function public.ensure_private_inventory(),public.create_shared_inventory(text),public.rename_inventory(uuid,text),
  public.delete_shared_inventory(uuid),public.save_item(uuid,uuid,text,numeric,text,text,integer),public.delete_item(uuid,uuid,integer),
  public.invite_member(uuid,text),public.pending_invitations(),public.respond_to_invitation(uuid,boolean),public.revoke_invitation(uuid),
  public.inventory_people(uuid),public.remove_member(uuid,uuid) to authenticated;
revoke all on function private.protect_owned_shared_inventory() from public,anon,authenticated;
commit;
