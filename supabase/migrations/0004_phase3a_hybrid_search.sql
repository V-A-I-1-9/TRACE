-- supabase/migrations/0004_phase3a_hybrid_search.sql

-- 1. Enable pgvector extension
create extension if not exists vector;

-- 2. Add embedding column to memories (768 dimensions for gemini-embedding-2)
alter table public.memories 
add column if not exists embedding vector(768);

-- 3. Add HNSW index for fast vector similarity search using cosine distance
create index if not exists memories_embedding_idx 
on public.memories 
using hnsw (embedding vector_cosine_ops);

-- 4. Create or replace the hybrid search function
create or replace function public.search_user_context(
  p_query text,
  p_embedding vector(768) default null
)
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
declare
  v_strict_query tsquery;
  v_broad_query tsquery;
begin
  -- 1. Strict query: Honors user quotes ("exact phrase") and negations (-exclude).
  v_strict_query := websearch_to_tsquery('english', p_query);
  
  -- 2. Broad query: Converts conversational positive tokens into an OR query for fallback.
  v_broad_query := cast(nullif(replace(plainto_tsquery('english', p_query)::text, '&', '|'), '') as tsquery);

  return query
  with search_docs as (
    select
      m.id as m_id,
      m.title,
      m.summary,
      m.category,
      m.event_date,
      m.source_type,
      m.source_path,
      m.embedding,
      (
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
      ) as document
    from public.memories m
    where m.user_id = auth.uid()
  ),
  fts_results as (
    select
      sd.m_id,
      (ts_rank(sd.document, v_strict_query) * 2.0 + ts_rank(sd.document, v_broad_query))::real as fts_score,
      row_number() over (order by (ts_rank(sd.document, v_strict_query) * 2.0 + ts_rank(sd.document, v_broad_query)) desc) as fts_rank
    from search_docs sd
    where 
      sd.document @@ v_strict_query
      OR 
      (sd.document @@ v_broad_query and ts_rank(sd.document, v_broad_query) > 0.1)
  ),
  vec_results as (
    select
      sd.m_id,
      (1 - (sd.embedding <=> p_embedding))::real as vec_score,
      row_number() over (order by sd.embedding <=> p_embedding) as vec_rank
    from search_docs sd
    where p_embedding is not null and sd.embedding is not null
  ),
  combined as (
    select
      sd.m_id,
      sd.title,
      sd.summary,
      sd.category,
      sd.event_date,
      sd.source_type,
      sd.source_path,
      -- Reciprocal Rank Fusion (RRF)
      -- K=60 is a standard constant used in RRF
      (
        coalesce(100.0 / (60 + fts_results.fts_rank), 0.0) +
        coalesce(100.0 / (60 + vec_results.vec_rank), 0.0)
      )::real as rrf_score
    from search_docs sd
    left join fts_results on fts_results.m_id = sd.m_id
    left join vec_results on vec_results.m_id = sd.m_id
    where fts_results.m_id is not null or vec_results.m_id is not null
  )
  select
    c.m_id,
    c.title,
    c.summary,
    c.category,
    c.event_date,
    c.source_type,
    c.source_path,
    -- Context Compression: Limit to top 5 most relevant claims per memory to save Gemini tokens
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', claim.id,
          'text', claim.claim_text,
          'status', claim.provenance_status
        ))
        from (
          select cl.id, cl.claim_text, cl.provenance_status,
                 ts_rank(to_tsvector('english', cl.claim_text), v_broad_query) as claim_rank
          from public.claims cl
          where cl.memory_id = c.m_id
          order by claim_rank desc
          limit 5
        ) claim
      ),
      '[]'::jsonb
    ) as claims_json,
    coalesce(
      (
        select jsonb_agg(jsonb_build_object(
          'id', e.id,
          'name', e.name,
          'type', e.type
        ))
        from public.entities e
        join public.memory_entities me on me.entity_id = e.id
        where me.memory_id = c.m_id
      ),
      '[]'::jsonb
    ) as entities_json,
    c.rrf_score as score
  from combined c
  order by c.rrf_score desc, c.event_date desc nulls last
  limit 5;
end;
$$;
