-- Interpret only an explicitly labelled, fully specified expiry date in observed source text.
create function public.trace_expiry_date(claim text) returns date
language plpgsql immutable strict security invoker set search_path = '' as $$
declare
  parts text[];
  stamp text;
begin
  stamp := (regexp_match(claim,
    '\m(?:expires?|expir(?:y|ation)(?: date)?|valid (?:until|till|through)|redeem by)\s*(?:(?:on|is|by)\s+)?[:=-]?\s*(\d{4}-\d{2}-\d{2}|\d{1,2}(?:st|nd|rd|th)?[ -]+[a-z]{3,9}[ ,-]+\d{4}|[a-z]{3,9} \d{1,2}(?:st|nd|rd|th)?[ ,]+\d{4})\M','i'))[1];
  if stamp is null then return null; end if;
  if stamp ~ '^\d{4}-' then return stamp::date; end if;
  stamp := regexp_replace(lower(stamp),'(\d)(st|nd|rd|th)\M','\1','g');
  parts := regexp_split_to_array(stamp,'[ ,\-]+');
  if parts[1] ~ '^[a-z]' then parts := array[parts[2],parts[1],parts[3]]; end if;
  if parts[2] !~ '^(jan(uary)?|feb(ruary)?|mar(ch)?|apr(il)?|may|jun(e)?|jul(y)?|aug(ust)?|sep(t(ember)?)?|oct(ober)?|nov(ember)?|dec(ember)?)$' then return null; end if;
  return make_date(parts[3]::int,array_position(array['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'],left(parts[2],3)),parts[1]::int);
exception when datetime_field_overflow or invalid_datetime_format then return null;
end $$;

create index trace_observed_expiry_claims on public.claims(memory_id)
  where provenance_status='OBSERVED' and public.trace_expiry_date(claim_text) is not null;

create function public.trace_upcoming(p_start timestamptz,p_count integer,p_memory uuid default null)
returns table(id uuid,memory_id uuid,title text,date timestamptz,kind text)
language sql stable security invoker set search_path='' as $$
  with coupons as (
    select m.id,m.title from public.memories m where m.user_id=(select auth.uid())
      and (p_memory is null or m.id=p_memory)
      and concat_ws(' ',m.category,m.title,m.summary) ~* '\m(coupons?|vouchers?|promo codes?|discount codes?|store rewards?)\M'
  ), expiries as (
    select distinct m.id,m.title,public.trace_expiry_date(c.claim_text)::timestamp at time zone 'Asia/Kolkata' as dt
    from coupons m join public.claims c on c.memory_id=m.id where c.provenance_status='OBSERVED'
      and public.trace_expiry_date(c.claim_text) is not null
  ), dates as (
    select e.id,e.memory_id,e.title,d.dt,
      case when cp.id is not null and (d.kind='DEADLINE' or (e.event_type||' '||e.title) ~* '(expir|valid until)') then 'COUPON_EXPIRY' else d.kind end as kind
    from public.events e left join coupons cp on cp.id=e.memory_id
    cross join lateral (values (e.event_date,e.event_type),(e.due_date,'DEADLINE')) d(dt,kind)
    where e.user_id=(select auth.uid()) and (p_memory is null or e.memory_id=p_memory) and d.dt>=p_start
      and (d.kind<>'DEADLINE' or e.due_date is distinct from e.event_date or e.event_type='DEADLINE')
      and not exists (select 1 from expiries x where x.id=e.memory_id and (x.dt at time zone 'Asia/Kolkata')::date=(d.dt at time zone 'Asia/Kolkata')::date
        and (d.kind='DEADLINE' or (e.event_type||' '||e.title) ~* '(coupon|voucher|expir|offer)'))
    union all select x.id,x.id,x.title,x.dt,'COUPON_EXPIRY' from expiries x where x.dt>=p_start
  )
  select distinct d.id,d.memory_id,d.title,d.dt,d.kind from dates d order by d.dt,d.title,d.id limit least(greatest(p_count,1),100)
$$;

-- Return the canonical stored row, including concurrent duplicates, in the commit round trip.
create function public.trace_capture_receipt(p_source_type text,p_source_path text,p_hash text,p_capture jsonb)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare saved_id uuid;
begin
  saved_id:=public.trace_capture(p_source_type,p_source_path,p_hash,p_capture);
  return (select jsonb_build_object('id',m.id,'title',m.title,'summary',m.summary,'category',m.category,'source_path',m.source_path)
          from public.memories m where m.id=saved_id and m.user_id=auth.uid());
end $$;
revoke all on function public.trace_upcoming(timestamptz,integer,uuid), public.trace_capture_receipt(text,text,text,jsonb) from public,anon;
grant execute on function public.trace_upcoming(timestamptz,integer,uuid), public.trace_capture_receipt(text,text,text,jsonb) to authenticated;
