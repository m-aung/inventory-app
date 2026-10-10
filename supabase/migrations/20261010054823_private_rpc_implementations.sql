-- Keep privileged code outside the exposed Data API schema.
begin;
do $migration$
declare
  f record;
  argument_refs text;
  wrapper_sql text;
begin
  for f in
    select p.oid,p.proname,p.pronargs,p.provolatile,
      pg_get_function_identity_arguments(p.oid) as identity_args,
      pg_get_function_arguments(p.oid) as declaration_args,
      pg_get_function_result(p.oid) as result_type
    from pg_proc p join pg_namespace n on n.oid=p.pronamespace
    where n.nspname='public' and p.proname = any(array[
      'ensure_private_inventory','create_shared_inventory','rename_inventory',
      'delete_shared_inventory','save_item','delete_item','invite_member',
      'pending_invitations','respond_to_invitation','revoke_invitation',
      'inventory_people','remove_member'])
  loop
    select coalesce(string_agg('$' || i::text,',' order by i),'')
      into argument_refs from generate_series(1,f.pronargs) i;
    execute format('alter function public.%I(%s) set schema private',f.proname,f.identity_args);
    wrapper_sql := format('select * from private.%I(%s)',f.proname,argument_refs);
    execute format(
      'create function public.%I(%s) returns %s language sql %s security invoker set search_path = '''' as %L',
      f.proname,f.declaration_args,f.result_type,
      case when f.provolatile='s' then 'stable' else 'volatile' end,wrapper_sql);
    execute format('revoke all on function public.%I(%s) from public,anon',f.proname,f.identity_args);
    execute format('grant execute on function public.%I(%s) to authenticated',f.proname,f.identity_args);
  end loop;
  -- Supabase's automatic RLS event trigger has no reason to be a client RPC.
  if to_regprocedure('public.rls_auto_enable()') is not null then
    execute 'revoke execute on function public.rls_auto_enable() from public,anon,authenticated';
  end if;
end $migration$;
commit;
