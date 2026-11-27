-- Additive migration: old clients and previously captured sources stay usable.
alter table public.memories add column if not exists content_hash text;
create unique index if not exists memories_source_hash
  on public.memories(user_id, source_type, content_hash) where content_hash is not null;
create index if not exists trace_entity_lookup on public.entities(user_id, lower(btrim(name)));
create index if not exists trace_claim_memory on public.claims(memory_id);

create or replace function public.trace_capture(
  p_source_type text, p_source_path text, p_hash text, p_capture jsonb
) returns uuid language plpgsql security invoker set search_path = '' as $$
declare
  owner_id uuid := auth.uid();
  memory_id_new uuid;
  entity_id_found uuid;
  item jsonb;
  event_id_new uuid;
  target_date timestamptz;
  lead_days integer;
begin
  if owner_id is null or split_part(p_source_path,'/',1) is distinct from owner_id::text then
    raise exception 'Invalid source owner';
  end if;
  -- Serialise the short commit per account, including lookup of legacy duplicate names.
  perform pg_advisory_xact_lock(hashtextextended(owner_id::text, 0));
  select id into memory_id_new from public.memories
    where user_id=owner_id and source_type=p_source_type and content_hash=p_hash;
  if found then return memory_id_new; end if;
  insert into public.memories(user_id,title,summary,category,event_date,source_type,source_path,content_hash)
    values(owner_id,p_capture->>'title',p_capture->>'summary',p_capture->>'category',
      (p_capture->>'event_date')::timestamptz,p_source_type,p_source_path,p_hash) returning id into memory_id_new;
  for item in select value from jsonb_array_elements(p_capture->'entities') loop
    select id into entity_id_found from public.entities
      where user_id=owner_id and lower(btrim(name))=lower(btrim(item->>'name')) order by created_at,id limit 1;
    if not found then
      insert into public.entities(user_id,name,type) values(owner_id,btrim(item->>'name'),item->>'type')
        returning id into entity_id_found;
    end if;
    insert into public.memory_entities(memory_id,entity_id,relationship)
      values(memory_id_new,entity_id_found,item->>'relationship') on conflict do nothing;
  end loop;
  insert into public.claims(memory_id,claim_text,provenance_status,source_reference)
    select memory_id_new,c->>'claim_text',c->>'provenance_status',c->>'source_reference'
    from jsonb_array_elements(p_capture->'claims') c;
  for item in select value from jsonb_array_elements(p_capture->'events') loop
    insert into public.events(user_id,memory_id,title,event_type,event_date,due_date,priority)
      values(owner_id,memory_id_new,item->>'title',upper(item->>'event_type'),(item->>'event_date')::timestamptz,
        (item->>'due_date')::timestamptz,item->>'priority') returning id into event_id_new;
    target_date := coalesce((item->>'event_date')::timestamptz,(item->>'due_date')::timestamptz);
    if target_date >= current_date then
      lead_days := case upper(item->>'event_type') when 'TRAVEL' then 2 when 'APPOINTMENT' then 1
        when 'MAINTENANCE' then 7 when 'SERVICE' then 7 else 0 end;
      insert into public.reminders(user_id,event_id,title,reminder_date)
        values(owner_id,event_id_new,item->>'title',greatest(now(),target_date-make_interval(days=>lead_days)));
    end if;
  end loop;
  return memory_id_new;
end $$;

create or replace function public.trace_retrieve(
  p_terms text, p_memory uuid default null, p_vector extensions.vector default null
) returns table(memory_id uuid,title text,summary text,category text,source_type text,source_path text,
  event_date timestamptz,claims jsonb,entities jsonb)
language sql stable security invoker set search_path = public, extensions as $$
  with query as (
    select nullif(replace(plainto_tsquery('english',p_terms)::text,' & ',' | '),'')::tsquery as terms
  ), docs as (
    select m.*, c.items as claim_items, e.items as entity_items,
      setweight(to_tsvector('english',concat_ws(' ',m.title,m.category)),'A') ||
      setweight(to_tsvector('english',coalesce(e.names,'')),'A') ||
      setweight(to_tsvector('english',concat_ws(' ',m.summary,c.words)),'B') as doc
    from public.memories m
    left join lateral (select string_agg(cl.claim_text,' ') as words,
      jsonb_agg(jsonb_build_object('text',cl.claim_text,'status',cl.provenance_status)
        order by ts_rank(to_tsvector('english',cl.claim_text),(select terms from query)) desc,cl.id) as items
      from public.claims cl where cl.memory_id=m.id) c on true
    left join lateral (select string_agg(en.name,' ') as names,
      jsonb_agg(jsonb_build_object('name',en.name,'type',en.type,'relationship',me.relationship) order by en.name) as items
      from public.memory_entities me join public.entities en on en.id=me.entity_id where me.memory_id=m.id) e on true
    where m.user_id=(select auth.uid()) and (p_memory is null or m.id=p_memory)
  )
  select d.id,d.title,d.summary,d.category,d.source_type,d.source_path,d.event_date,
    coalesce(d.claim_items,'[]'),coalesce(d.entity_items,'[]')
  from docs d cross join query q
  where p_memory is not null or d.doc @@ q.terms or
    (p_vector is not null and (d.embedding <=> p_vector) <= 0.35)
  order by coalesce(ts_rank(d.doc,q.terms),0) desc, (d.embedding <=> p_vector) asc nulls last,d.created_at desc,d.id
  limit 5
$$;

create or replace function public.trace_save_turn(p_conversation uuid,p_question text,p_answer text,p_details jsonb)
returns void language plpgsql security invoker set search_path='' as $$
declare stamp timestamptz;
begin
  perform 1 from public.conversations where id=p_conversation and user_id=auth.uid() for update;
  if not found then raise exception 'Conversation unavailable'; end if;
  stamp := clock_timestamp();
  insert into public.messages(user_id,conversation_id,role,content,structured_response,created_at)
    values(auth.uid(),p_conversation,'user',p_question,null,stamp),
          (auth.uid(),p_conversation,'assistant',p_answer,p_details,stamp+interval '1 microsecond');
  update public.conversations set updated_at=stamp where id=p_conversation;
end $$;

revoke all on function public.trace_capture(text,text,text,jsonb), public.trace_retrieve(text,uuid,extensions.vector),
  public.trace_save_turn(uuid,text,text,jsonb) from public, anon;
grant execute on function public.trace_capture(text,text,text,jsonb), public.trace_retrieve(text,uuid,extensions.vector),
  public.trace_save_turn(uuid,text,text,jsonb) to authenticated;
