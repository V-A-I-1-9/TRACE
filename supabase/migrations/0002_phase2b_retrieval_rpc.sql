-- supabase/migrations/0002_phase2b_retrieval_rpc.sql

-- 1. Create functional GIN indexes for individual tables to assist text searches
create index if not exists idx_memories_fts on public.memories using gin (to_tsvector('english', coalesce(title, '') || ' ' || coalesce(summary, '')));
create index if not exists idx_claims_fts on public.claims using gin (to_tsvector('english', coalesce(claim_text, '')));
create index if not exists idx_entities_fts on public.entities using gin (to_tsvector('english', coalesce(name, '')));

-- 2. Create the retrieval RPC returning memory-level evidence
create or replace function public.search_user_context(p_query text)
returns table (
  memory_id uuid,
  title text,
  summary text,
  category text,
  event_date timestamp with time zone,
  source_type text,
  source_path text,
  claims jsonb,
  entities jsonb,
  relevance_score real
)
language plpgsql
security invoker
as $$
begin
  return query
  select
    m.id as memory_id,
    m.title,
    m.summary,
    m.category,
    m.event_date,
    m.source_type,
    m.source_path,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', c.id,
          'text', c.claim_text,
          'status', c.provenance_status
        ))
        from public.claims c
        where c.memory_id = m.id
      ),
      '[]'::jsonb
    ) as claims,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'type', e.type
        ))
        from public.entities e
        join public.memory_entities me on me.entity_id = e.id
        where me.memory_id = m.id
      ),
      '[]'::jsonb
    ) as entities,
    ts_rank(
      setweight(to_tsvector('english', coalesce(m.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(m.summary, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(
        (select string_agg(e.name, ' ') from public.entities e join public.memory_entities me on me.entity_id = e.id where me.memory_id = m.id),
        ''
      )), 'C') ||
      setweight(to_tsvector('english', coalesce(
        (select string_agg(c.claim_text, ' ') from public.claims c where c.memory_id = m.id),
        ''
      )), 'D'),
      websearch_to_tsquery('english', p_query)
    ) as relevance_score
  from public.memories m
  where m.user_id = auth.uid()
    and (
      setweight(to_tsvector('english', coalesce(m.title, '')), 'A') ||
      setweight(to_tsvector('english', coalesce(m.summary, '')), 'B') ||
      setweight(to_tsvector('english', coalesce(
        (select string_agg(e.name, ' ') from public.entities e join public.memory_entities me on me.entity_id = e.id where me.memory_id = m.id),
        ''
      )), 'C') ||
      setweight(to_tsvector('english', coalesce(
        (select string_agg(c.claim_text, ' ') from public.claims c where c.memory_id = m.id),
        ''
      )), 'D')
    ) @@ websearch_to_tsquery('english', p_query)
  order by relevance_score desc, m.event_date desc nulls last
  limit 5;
end;
$$;

-- 3. Manage execution privileges
revoke execute on function public.search_user_context(text) from public;
grant execute on function public.search_user_context(text) to authenticated;
