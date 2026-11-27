create or replace function public.trace_delete_memory(p_memory uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  original text;
  candidate_entities uuid[];
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  -- Capture uses the same owner lock when resolving shared entities and content hashes.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select m.source_path into original from public.memories m
    where m.user_id = owner_id and m.id = p_memory for update;
  if not found then return; end if;
  select array_agg(entity_id) into candidate_entities
    from public.memory_entities where memory_id = p_memory;
  delete from public.memories where user_id = owner_id and id = p_memory;
  delete from public.entities e where e.user_id = owner_id and e.id = any(candidate_entities)
    and not exists (select 1 from public.memory_entities me where me.entity_id = e.id);
  if split_part(original,'/',1) = owner_id::text and not exists (
    select 1 from public.memories where user_id = owner_id and source_path = original
  ) then
    insert into public.trace_source_cleanup(memory_id,user_id,source_path) values(p_memory,owner_id,original);
  end if;
end;
$$;
