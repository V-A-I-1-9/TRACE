-- supabase/migrations/0003_phase2b_fts_natural_language.sql

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
declare
  v_strict_query tsquery;
  v_broad_query tsquery;
begin
  -- 1. Strict query: Honors user quotes ("exact phrase") and negations (-exclude).
  -- This provides highly precise matching when the user uses explicit search operators.
  v_strict_query := websearch_to_tsquery('english', p_query);
  
  -- 2. Broad query: Converts conversational positive tokens into an OR query for fallback.
  -- SAFE CONSTRUCT: We apply string replacement on plainto_tsquery, NOT websearch_to_tsquery.
  -- websearch_to_tsquery can produce NOT operators (!'term'). If we replaced '&' with '|' there, 
  -- we would create `| !'term'`, which matches the entire database (catastrophic false positives).
  -- plainto_tsquery explicitly drops operators and only produces positive ANDs ('a' & 'b').
  -- Converting that to 'a' | 'b' safely matches ANY meaningful positive term in the sentence.
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
      ) as document,
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
          where me.memory_id = m.id
        ),
        '[]'::jsonb
      ) as entities_json
    from public.memories m
    where m.user_id = auth.uid()
  )
  select
    sd.m_id,
    sd.title,
    sd.summary,
    sd.category,
    sd.event_date,
    sd.source_type,
    sd.source_path,
    sd.claims_json,
    sd.entities_json,
    -- Heavily bias the score if it matches the strict query, otherwise use broad score
    (ts_rank(sd.document, v_strict_query) * 2.0 + ts_rank(sd.document, v_broad_query))::real as score
  from search_docs sd
  where 
    -- A: Document matches the strict AND/phrase/negation query
    sd.document @@ v_strict_query
    OR 
    -- B: Document matches the broad OR query, AND the match is significant (> 0.1).
    -- A single generic word (like "number") in a D-weight claim scores ~0.06 and is rejected.
    -- A meaningful word (like "Activa" or "Aadhaar") in an A-weight Title/C-weight Entity scores > 0.1.
    (sd.document @@ v_broad_query and ts_rank(sd.document, v_broad_query) > 0.1)
  order by score desc, sd.event_date desc nulls last
  limit 5;
end;
$$;
