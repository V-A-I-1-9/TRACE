-- Create an RPC to atomically insert a memory along with its entities and claims.
-- SECURITY INVOKER ensures RLS policies apply correctly based on the calling user.

create or replace function public.capture_memory_atomic(
  p_title text,
  p_summary text,
  p_category text,
  p_source_type text,
  p_source_path text,
  p_event_date timestamp with time zone,
  p_entities jsonb,
  p_claims jsonb
)
returns uuid
language plpgsql
security invoker
as $$
declare
  v_user_id uuid;
  v_memory_id uuid;
  v_entity jsonb;
  v_entity_id uuid;
  v_claim jsonb;
begin
  -- 1. Derive user_id safely from session
  v_user_id := auth.uid();
  if v_user_id is null then
    raise exception 'Not authenticated';
  end if;

  -- 2. Insert the memory
  insert into public.memories (
    user_id, title, summary, category, source_type, source_path, event_date
  ) values (
    v_user_id, p_title, p_summary, p_category, p_source_type, p_source_path, p_event_date
  ) returning id into v_memory_id;

  -- 3. Process entities and relationships
  if p_entities is not null then
    for v_entity in select * from jsonb_array_elements(p_entities)
    loop
      -- Insert entity
      insert into public.entities (
        user_id, name, type
      ) values (
        v_user_id, v_entity->>'name', v_entity->>'type'
      ) returning id into v_entity_id;

      -- Insert relationship
      insert into public.memory_entities (
        memory_id, entity_id, relationship
      ) values (
        v_memory_id, v_entity_id, v_entity->>'relationship'
      );
    end loop;
  end if;

  -- 4. Process claims
  if p_claims is not null then
    for v_claim in select * from jsonb_array_elements(p_claims)
    loop
      insert into public.claims (
        memory_id, claim_text, provenance_status, source_reference
      ) values (
        v_memory_id, v_claim->>'claim_text', v_claim->>'provenance_status', v_claim->>'source_reference'
      );
    end loop;
  end if;

  return v_memory_id;
end;
$$;

-- Revoke public execution first
revoke execute on function public.capture_memory_atomic(
  text, text, text, text, text, timestamp with time zone, jsonb, jsonb
) from public;

grant execute on function public.capture_memory_atomic(
  text, text, text, text, text, timestamp with time zone, jsonb, jsonb
) to authenticated;
