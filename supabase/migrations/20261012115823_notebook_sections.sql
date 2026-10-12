begin;

create table public.inventory_sections (
  id uuid primary key,
  inventory_id uuid not null references public.inventories(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 80 and lower(btrim(name)) not in ('all items','unsorted')),
  color text not null check (color in ('#377CCC','#8D64C8','#B77728','#18846D','#BF5976')),
  version integer not null default 1 check (version > 0),
  created_at timestamptz not null default now(),
  unique (inventory_id,id)
);
create unique index unique_section_name on public.inventory_sections(inventory_id,lower(btrim(name)));
create index sections_by_inventory on public.inventory_sections(inventory_id,created_at,id);
alter table public.items add column section_id uuid;
alter table public.items add column last_mutation_id uuid;
alter table public.items add constraint item_section_inventory foreign key (inventory_id,section_id)
  references public.inventory_sections(inventory_id,id);
create index items_by_section on public.items(inventory_id,section_id) where section_id is not null;
alter table public.inventory_sections enable row level security;
create policy sections_read on public.inventory_sections for select to authenticated
  using (private.viewer_email() is not null and private.can_access(inventory_id));
revoke all on public.inventory_sections from public,anon,authenticated;
grant select on public.inventory_sections to authenticated;

create function private.save_section(p_id uuid,p_inventory uuid,p_name text,p_color text,p_version integer default null)
returns public.inventory_sections language plpgsql security definer set search_path = '' as $$
declare v_row public.inventory_sections;
begin
  perform private.require_user();
  perform 1 from public.inventories where id=p_inventory for update;
  if not private.is_owner(p_inventory) then raise exception 'Only the owner can manage sections.' using errcode='42501'; end if;
  if p_version is null then
    insert into public.inventory_sections(id,inventory_id,name,color)
      values(p_id,p_inventory,btrim(p_name),p_color) on conflict(id) do nothing returning * into v_row;
    if v_row.id is null then
      select * into v_row from public.inventory_sections where id=p_id and inventory_id=p_inventory;
      if v_row.id is null or v_row.name is distinct from btrim(p_name) or v_row.color is distinct from p_color then
        raise exception 'This section changed. Reload before saving.' using errcode='40001';
      end if;
    end if;
  else
    update public.inventory_sections set name=btrim(p_name),color=p_color,version=version+1
      where id=p_id and inventory_id=p_inventory and version=p_version returning * into v_row;
    if v_row.id is null then
      select * into v_row from public.inventory_sections where id=p_id and inventory_id=p_inventory;
      if v_row.id is null or v_row.version <> p_version+1 or v_row.name is distinct from btrim(p_name) or v_row.color is distinct from p_color then
        raise exception 'This section changed. Reload before saving.' using errcode='40001';
      end if;
    end if;
  end if;
  return v_row;
end $$;

create function private.delete_section(p_id uuid,p_inventory uuid,p_version integer)
returns void language plpgsql security definer set search_path = '' as $$
declare v_version integer;
begin
  perform private.require_user();
  perform 1 from public.inventories where id=p_inventory for update;
  if not private.is_owner(p_inventory) then raise exception 'Only the owner can manage sections.' using errcode='42501'; end if;
  select version into v_version from public.inventory_sections where id=p_id and inventory_id=p_inventory;
  if not found then return; end if; -- safe retry of a completed removal
  if v_version is distinct from p_version then raise exception 'This section changed. Reload before removing.' using errcode='40001'; end if;
  update public.items set section_id=null,version=version+1,updated_at=now()
    where inventory_id=p_inventory and section_id=p_id;
  delete from public.inventory_sections where id=p_id and inventory_id=p_inventory;
end $$;

create function private.save_item_with_section(p_id uuid,p_inventory uuid,p_name text,p_quantity numeric,p_unit text,p_notes text,p_version integer,p_section uuid,p_request uuid default null)
returns public.items language plpgsql security definer set search_path = '' as $$
declare v_row public.items;
begin
  perform private.require_user();
  perform 1 from public.inventories where id=p_inventory for update;
  if not private.can_access(p_inventory) then raise exception 'Inventory access denied.' using errcode='42501'; end if;
  if p_section is not null and not exists(select 1 from public.inventory_sections where id=p_section and inventory_id=p_inventory) then
    if p_version is not null then raise exception 'This item or its section changed. Reload it before saving.' using errcode='40001'; end if;
    raise exception 'The selected section is no longer available. Choose another section or Unsorted.' using errcode='22023';
  end if;
  if p_version is null then
    insert into public.items(id,inventory_id,name,quantity,unit,notes,section_id,last_mutation_id)
      values(p_id,p_inventory,btrim(p_name),p_quantity,p_unit,coalesce(p_notes,''),p_section,p_request) on conflict(id) do nothing returning * into v_row;
    if v_row.id is null then
      select * into v_row from public.items where id=p_id and inventory_id=p_inventory;
      if v_row.id is null or v_row.name is distinct from btrim(p_name) or v_row.quantity is distinct from p_quantity
        or v_row.unit is distinct from p_unit or v_row.notes is distinct from coalesce(p_notes,'') or v_row.section_id is distinct from p_section
        or (p_request is not null and v_row.last_mutation_id is distinct from p_request) then
        raise exception 'This request already saved different values. Reload the item.' using errcode='40001';
      end if;
    end if;
  else
    update public.items set name=btrim(p_name),quantity=p_quantity,unit=p_unit,notes=coalesce(p_notes,''),section_id=p_section,last_mutation_id=p_request,
      version=version+1,updated_at=now() where id=p_id and inventory_id=p_inventory and version=p_version returning * into v_row;
    if v_row.id is null then
      select * into v_row from public.items where id=p_id and inventory_id=p_inventory;
      if v_row.id is null or v_row.version <> p_version+1 or v_row.name is distinct from btrim(p_name)
        or v_row.quantity is distinct from p_quantity or v_row.unit is distinct from p_unit or v_row.notes is distinct from coalesce(p_notes,'')
        or v_row.section_id is distinct from p_section
        or (p_request is not null and v_row.last_mutation_id is distinct from p_request) then
        raise exception 'This item changed. Reload it before saving.' using errcode='40001';
      end if;
    end if;
  end if;
  return v_row;
end $$;

-- Old installed clients retain assigned sections when updating quantities or notes.
create or replace function private.save_item(p_id uuid,p_inventory uuid,p_name text,p_quantity numeric,p_unit text,p_notes text,p_version integer default null)
returns public.items language plpgsql security definer set search_path = '' as $$
declare v_section uuid;
begin
  perform private.require_user();
  perform 1 from public.inventories where id=p_inventory for update;
  if not private.can_access(p_inventory) then raise exception 'Inventory access denied.' using errcode='42501'; end if;
  select section_id into v_section from public.items where id=p_id and inventory_id=p_inventory;
  return private.save_item_with_section(p_id,p_inventory,p_name,p_quantity,p_unit,p_notes,p_version,v_section);
end $$;

create function public.save_section(p_id uuid,p_inventory uuid,p_name text,p_color text,p_version integer default null)
returns public.inventory_sections language sql security invoker set search_path = '' as $$
  select * from private.save_section(p_id,p_inventory,p_name,p_color,p_version)
$$;
create function public.delete_section(p_id uuid,p_inventory uuid,p_version integer)
returns void language sql security invoker set search_path = '' as $$
  select private.delete_section(p_id,p_inventory,p_version)
$$;
create function public.save_item_with_section(p_id uuid,p_inventory uuid,p_name text,p_quantity numeric,p_unit text,p_notes text,p_version integer,p_section uuid,p_request uuid default null)
returns public.items language sql security invoker set search_path = '' as $$
  select * from private.save_item_with_section(p_id,p_inventory,p_name,p_quantity,p_unit,p_notes,p_version,p_section,p_request)
$$;
revoke all on function private.save_section(uuid,uuid,text,text,integer), private.delete_section(uuid,uuid,integer),
  private.save_item_with_section(uuid,uuid,text,numeric,text,text,integer,uuid,uuid), private.save_item(uuid,uuid,text,numeric,text,text,integer) from public,anon;
revoke all on function public.save_section(uuid,uuid,text,text,integer), public.delete_section(uuid,uuid,integer),
  public.save_item_with_section(uuid,uuid,text,numeric,text,text,integer,uuid,uuid) from public,anon;
grant execute on function private.save_section(uuid,uuid,text,text,integer), private.delete_section(uuid,uuid,integer),
  private.save_item_with_section(uuid,uuid,text,numeric,text,text,integer,uuid,uuid), private.save_item(uuid,uuid,text,numeric,text,text,integer) to authenticated;
grant execute on function public.save_section(uuid,uuid,text,text,integer), public.delete_section(uuid,uuid,integer),
  public.save_item_with_section(uuid,uuid,text,numeric,text,text,integer,uuid,uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
