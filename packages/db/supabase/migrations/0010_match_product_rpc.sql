-- Cascada de matching: Capa 1 (exacto sobre alias_normalized) → Capa 2 (pg_trgm).
-- SECURITY INVOKER: respeta la RLS de canonical_products (is_household_member).
-- Devuelve un único jsonb con la forma { exact, fuzzy }.

create or replace function public.match_product(
  p_household_id uuid,
  p_normalized text,
  p_min_similarity numeric default 0.6
) returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_exact jsonb;
  v_fuzzy jsonb;
begin
  if coalesce(trim(p_normalized), '') = '' then
    return jsonb_build_object('exact', null, 'fuzzy', '[]'::jsonb);
  end if;

  -- Capa 1: match exacto sobre alias_normalized
  select jsonb_build_object('canonical_id', cp.id, 'name', cp.name, 'confidence', 1.0)
    into v_exact
    from public.product_aliases pa
    join public.canonical_products cp on cp.id = pa.canonical_product_id
    where pa.alias_normalized = p_normalized
      and cp.household_id = p_household_id
      and cp.deleted_at is null
    limit 1;

  if v_exact is not null then
    return jsonb_build_object('exact', v_exact, 'fuzzy', '[]'::jsonb);
  end if;

  -- Capa 2: fuzzy con dedupe por canonical (mejor score gana)
  with hits as (
    select cp.id as canonical_id,
           cp.name,
           max(similarity(pa.alias_normalized, p_normalized)) as score
      from public.product_aliases pa
      join public.canonical_products cp on cp.id = pa.canonical_product_id
      where cp.household_id = p_household_id
        and cp.deleted_at is null
        and similarity(pa.alias_normalized, p_normalized) >= p_min_similarity
      group by cp.id, cp.name
  )
  select coalesce(
    jsonb_agg(jsonb_build_object('canonical_id', canonical_id, 'name', name, 'score', score)
              order by score desc),
    '[]'::jsonb
  )
  into v_fuzzy
  from (select * from hits order by score desc limit 3) t;

  return jsonb_build_object('exact', null, 'fuzzy', v_fuzzy);
end;
$$;

revoke all on function public.match_product(uuid, text, numeric) from public;
grant execute on function public.match_product(uuid, text, numeric) to authenticated;
