-- Keep a durable receipt for Storage API work following a committed memory deletion.
create table public.trace_source_cleanup (
  memory_id uuid primary key,
  user_id uuid not null references auth.users(id) on delete cascade,
  source_path text not null check (split_part(source_path, '/', 1) = user_id::text),
  queued_at timestamptz not null default now()
);
create index trace_source_cleanup_owner on public.trace_source_cleanup(user_id, queued_at);
alter table public.trace_source_cleanup enable row level security;
revoke all on public.trace_source_cleanup from anon, authenticated;
grant select, insert, delete on public.trace_source_cleanup to authenticated;
create policy "Read own cleanup receipts" on public.trace_source_cleanup for select to authenticated using (user_id = (select auth.uid()));
create policy "Queue own source" on public.trace_source_cleanup for insert to authenticated with check (user_id = (select auth.uid()));
create policy "Finish own cleanup" on public.trace_source_cleanup for delete to authenticated using (user_id = (select auth.uid()));

create function public.trace_delete_memory(p_memory uuid) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  original text;
begin
  if owner_id is null then raise exception 'Sign in required'; end if;
  select m.source_path into original from public.memories m
    where m.user_id = owner_id and m.id = p_memory for update;
  if not found then return; end if;
  -- Older captures can share a file. Serialize the last-reference check for them.
  if original is not null then perform pg_advisory_xact_lock(hashtextextended(original, 0)); end if;
  delete from public.memories where user_id = owner_id and id = p_memory;
  if split_part(original,'/',1) = owner_id::text and not exists (
    select 1 from public.memories where user_id = owner_id and source_path = original
  ) then
    insert into public.trace_source_cleanup(memory_id,user_id,source_path) values(p_memory,owner_id,original);
  end if;
end;
$$;
revoke all on function public.trace_delete_memory(uuid) from public, anon;
grant execute on function public.trace_delete_memory(uuid) to authenticated;
