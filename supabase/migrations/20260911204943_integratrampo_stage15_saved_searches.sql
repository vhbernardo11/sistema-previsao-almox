-- IntegraTrampo · Etapa 15 · buscas salvas e novos resultados
-- Cada conta guarda seus próprios filtros; os resultados atuais viram linha de base e somente novidades futuras ficam pendentes.

create table if not exists public.it_saved_searches (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  entity_type text not null default 'all',
  filters jsonb not null default '{}'::jsonb,
  alerts_enabled boolean not null default true,
  last_checked_at timestamptz,
  constraint it_saved_searches_name_check check (char_length(btrim(name)) between 2 and 80),
  constraint it_saved_searches_type_check check (entity_type in ('all','opportunity','professional')),
  constraint it_saved_searches_filters_check check (jsonb_typeof(filters) = 'object'),
  constraint it_saved_searches_id_user_key unique (id,user_id)
);

create unique index if not exists it_saved_searches_user_name_uq on public.it_saved_searches(user_id, lower(name));
create index if not exists it_saved_searches_user_updated_idx on public.it_saved_searches(user_id, updated_at desc);

create table if not exists public.it_saved_search_hits (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  user_id uuid not null references auth.users(id) on delete cascade,
  saved_search_id uuid not null,
  entity_type text not null,
  entity_id uuid not null,
  seen_at timestamptz,
  constraint it_saved_search_hits_type_check check (entity_type in ('opportunity','professional')),
  constraint it_saved_search_hits_search_owner_fk foreign key (saved_search_id,user_id)
    references public.it_saved_searches(id,user_id) on delete cascade,
  constraint it_saved_search_hits_unique unique (saved_search_id,entity_type,entity_id)
);

create index if not exists it_saved_search_hits_user_unseen_idx on public.it_saved_search_hits(user_id,created_at desc) where seen_at is null;
create index if not exists it_saved_search_hits_search_idx on public.it_saved_search_hits(saved_search_id,created_at desc);

alter table public.it_saved_searches enable row level security;
alter table public.it_saved_search_hits enable row level security;

drop policy if exists it_saved_searches_select_own on public.it_saved_searches;
create policy it_saved_searches_select_own on public.it_saved_searches for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists it_saved_searches_insert_own on public.it_saved_searches;
create policy it_saved_searches_insert_own on public.it_saved_searches for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists it_saved_searches_update_own on public.it_saved_searches;
create policy it_saved_searches_update_own on public.it_saved_searches for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists it_saved_searches_delete_own on public.it_saved_searches;
create policy it_saved_searches_delete_own on public.it_saved_searches for delete to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists it_saved_search_hits_select_own on public.it_saved_search_hits;
create policy it_saved_search_hits_select_own on public.it_saved_search_hits for select to authenticated
using ((select auth.uid()) = user_id);
drop policy if exists it_saved_search_hits_insert_own on public.it_saved_search_hits;
create policy it_saved_search_hits_insert_own on public.it_saved_search_hits for insert to authenticated
with check ((select auth.uid()) = user_id);
drop policy if exists it_saved_search_hits_update_own on public.it_saved_search_hits;
create policy it_saved_search_hits_update_own on public.it_saved_search_hits for update to authenticated
using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
drop policy if exists it_saved_search_hits_delete_own on public.it_saved_search_hits;
create policy it_saved_search_hits_delete_own on public.it_saved_search_hits for delete to authenticated
using ((select auth.uid()) = user_id);

revoke all on table public.it_saved_searches from anon;
revoke all on table public.it_saved_search_hits from anon;
grant select,insert,update,delete on table public.it_saved_searches to authenticated;
grant select,insert,update,delete on table public.it_saved_search_hits to authenticated;

create or replace function public.it_saved_search_execute_v1(p_entity_type text,p_filters jsonb,p_limit integer default 60)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select public.it_search_marketplace_v1(
    p_entity_type,
    nullif(btrim(coalesce(p_filters->>'query','')),''),
    nullif(btrim(coalesce(p_filters->>'category','')),''),
    nullif(btrim(coalesce(p_filters->>'city','')),''),
    nullif(p_filters->>'min_rate','')::numeric,
    nullif(p_filters->>'max_rate','')::numeric,
    nullif(p_filters->>'min_rating','')::numeric,
    nullif(btrim(coalesce(p_filters->>'availability_status','')),''),
    nullif(p_filters->>'service_date','')::date,
    nullif(p_filters->>'min_affinity','')::integer,
    coalesce(nullif(btrim(p_filters->>'sort'),''),'relevance'),
    greatest(1,least(coalesce(p_limit,60),60))
  );
$$;

create or replace function public.it_save_my_search_v1(p_name text,p_entity_type text,p_filters jsonb default '{}'::jsonb,p_alerts_enabled boolean default true)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_name text := btrim(coalesce(p_name,''));
  v_type text := lower(coalesce(nullif(btrim(p_entity_type),''),'all'));
  v_input jsonb := coalesce(p_filters,'{}'::jsonb);
  v_filters jsonb;
  v_query text;
  v_category text;
  v_city text;
  v_min_rate numeric;
  v_max_rate numeric;
  v_min_rating numeric;
  v_availability text;
  v_service_date date;
  v_min_affinity integer;
  v_sort text;
  v_id uuid;
  v_result jsonb;
  v_baseline integer := 0;
  v_rows integer := 0;
  v_replaced boolean := false;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if char_length(v_name) < 2 or char_length(v_name) > 80 then raise exception 'invalid_saved_search_name'; end if;
  if v_type not in ('all','opportunity','professional') then raise exception 'invalid_entity_type'; end if;
  if jsonb_typeof(v_input) <> 'object' then raise exception 'invalid_search_filters'; end if;
  if exists(select 1 from jsonb_object_keys(v_input) k where k not in ('query','category','city','min_rate','max_rate','min_rating','availability_status','service_date','min_affinity','sort')) then
    raise exception 'invalid_search_filters';
  end if;

  begin
    v_query := nullif(btrim(v_input->>'query'),'');
    v_category := nullif(btrim(v_input->>'category'),'');
    v_city := nullif(btrim(v_input->>'city'),'');
    v_min_rate := nullif(v_input->>'min_rate','')::numeric;
    v_max_rate := nullif(v_input->>'max_rate','')::numeric;
    v_min_rating := nullif(v_input->>'min_rating','')::numeric;
    v_availability := nullif(btrim(v_input->>'availability_status'),'');
    v_service_date := nullif(v_input->>'service_date','')::date;
    v_min_affinity := nullif(v_input->>'min_affinity','')::integer;
    v_sort := coalesce(nullif(btrim(v_input->>'sort'),''),'relevance');
  exception when invalid_text_representation or datetime_field_overflow or numeric_value_out_of_range then
    raise exception 'invalid_search_filters';
  end;

  if coalesce(char_length(v_query),0) > 160 or coalesce(char_length(v_category),0) > 100 or coalesce(char_length(v_city),0) > 100 then raise exception 'invalid_search_filters'; end if;
  if v_type='all' and v_query is null and v_category is null and v_city is null and v_min_rate is null and v_max_rate is null and v_min_rating is null and v_availability is null and v_service_date is null and v_min_affinity is null then
    raise exception 'search_too_broad';
  end if;

  v_filters := jsonb_strip_nulls(jsonb_build_object(
    'query',v_query,'category',v_category,'city',v_city,'min_rate',v_min_rate,'max_rate',v_max_rate,
    'min_rating',v_min_rating,'availability_status',v_availability,'service_date',v_service_date,
    'min_affinity',v_min_affinity,'sort',v_sort
  ));

  v_result := public.it_saved_search_execute_v1(v_type,v_filters,60);

  select id into v_id from public.it_saved_searches
  where user_id=v_uid and lower(name)=lower(v_name) limit 1;

  if v_id is null then
    if (select count(*) from public.it_saved_searches where user_id=v_uid) >= 12 then raise exception 'saved_search_limit_reached'; end if;
    insert into public.it_saved_searches(user_id,name,entity_type,filters,alerts_enabled,last_checked_at)
    values(v_uid,v_name,v_type,v_filters,coalesce(p_alerts_enabled,true),now()) returning id into v_id;
  else
    v_replaced := true;
    update public.it_saved_searches set entity_type=v_type,filters=v_filters,alerts_enabled=coalesce(p_alerts_enabled,true),updated_at=now(),last_checked_at=now()
    where id=v_id and user_id=v_uid;
    delete from public.it_saved_search_hits where saved_search_id=v_id and user_id=v_uid;
  end if;

  insert into public.it_saved_search_hits(user_id,saved_search_id,entity_type,entity_id,seen_at)
  select v_uid,v_id,'opportunity',(x->>'id')::uuid,now()
  from jsonb_array_elements(coalesce(v_result->'opportunities','[]'::jsonb)) x
  on conflict (saved_search_id,entity_type,entity_id) do nothing;
  get diagnostics v_rows = row_count; v_baseline := v_baseline + v_rows;

  insert into public.it_saved_search_hits(user_id,saved_search_id,entity_type,entity_id,seen_at)
  select v_uid,v_id,'professional',(x->>'id')::uuid,now()
  from jsonb_array_elements(coalesce(v_result->'professionals','[]'::jsonb)) x
  on conflict (saved_search_id,entity_type,entity_id) do nothing;
  get diagnostics v_rows = row_count; v_baseline := v_baseline + v_rows;

  return jsonb_build_object('saved_search_id',v_id,'name',v_name,'replaced',v_replaced,'baseline_count',v_baseline,'alerts_enabled',coalesce(p_alerts_enabled,true));
end;
$$;

create or replace function public.it_my_saved_searches_v1()
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  with mine as (
    select s.*,
      (select count(*)::int from public.it_saved_search_hits h where h.saved_search_id=s.id and h.user_id=auth.uid() and h.seen_at is null) as new_count,
      (select max(h.created_at) from public.it_saved_search_hits h where h.saved_search_id=s.id and h.user_id=auth.uid() and h.seen_at is null) as latest_new_at
    from public.it_saved_searches s
    where s.user_id=auth.uid()
  )
  select jsonb_build_object(
    'authenticated',auth.uid() is not null,
    'counts',jsonb_build_object(
      'searches',(select count(*)::int from mine),
      'new_results',(select coalesce(sum(new_count),0)::int from mine)
    ),
    'searches',coalesce((select jsonb_agg(jsonb_build_object(
      'id',id,'name',name,'entity_type',entity_type,'filters',filters,'alerts_enabled',alerts_enabled,
      'created_at',created_at,'updated_at',updated_at,'last_checked_at',last_checked_at,
      'new_count',new_count,'latest_new_at',latest_new_at
    ) order by updated_at desc,id) from mine),'[]'::jsonb)
  );
$$;

create or replace function public.it_refresh_my_saved_searches_v1()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_search record;
  v_result jsonb;
  v_rows integer;
  v_created integer := 0;
  v_checked integer := 0;
  v_failed integer := 0;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  for v_search in select id,entity_type,filters from public.it_saved_searches where user_id=v_uid and alerts_enabled=true order by updated_at desc limit 12
  loop
    begin
      v_result := public.it_saved_search_execute_v1(v_search.entity_type,v_search.filters,60);
      insert into public.it_saved_search_hits(user_id,saved_search_id,entity_type,entity_id,seen_at)
      select v_uid,v_search.id,'opportunity',(x->>'id')::uuid,null
      from jsonb_array_elements(coalesce(v_result->'opportunities','[]'::jsonb)) x
      on conflict (saved_search_id,entity_type,entity_id) do nothing;
      get diagnostics v_rows = row_count; v_created := v_created + v_rows;

      insert into public.it_saved_search_hits(user_id,saved_search_id,entity_type,entity_id,seen_at)
      select v_uid,v_search.id,'professional',(x->>'id')::uuid,null
      from jsonb_array_elements(coalesce(v_result->'professionals','[]'::jsonb)) x
      on conflict (saved_search_id,entity_type,entity_id) do nothing;
      get diagnostics v_rows = row_count; v_created := v_created + v_rows;

      update public.it_saved_searches set last_checked_at=now() where id=v_search.id and user_id=v_uid;
      v_checked := v_checked + 1;
    exception when others then
      v_failed := v_failed + 1;
    end;
  end loop;
  return jsonb_build_object('created_count',v_created,'checked_count',v_checked,'failed_count',v_failed,'checked_at',now());
end;
$$;

create or replace function public.it_run_my_saved_search_v1(p_search_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_search public.it_saved_searches%rowtype;
  v_result jsonb;
  v_seen integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_search from public.it_saved_searches where id=p_search_id and user_id=v_uid;
  if v_search.id is null then raise exception 'saved_search_not_found'; end if;
  v_result := public.it_saved_search_execute_v1(v_search.entity_type,v_search.filters,60);
  update public.it_saved_search_hits set seen_at=coalesce(seen_at,now()) where saved_search_id=v_search.id and user_id=v_uid and seen_at is null;
  get diagnostics v_seen = row_count;
  update public.it_saved_searches set last_checked_at=now() where id=v_search.id and user_id=v_uid;
  return v_result || jsonb_build_object('saved_search_id',v_search.id,'saved_search_name',v_search.name,'marked_seen',v_seen);
end;
$$;

create or replace function public.it_set_my_saved_search_alerts_v1(p_search_id uuid,p_enabled boolean)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_rows integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.it_saved_searches set alerts_enabled=coalesce(p_enabled,false),updated_at=now() where id=p_search_id and user_id=v_uid;
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception 'saved_search_not_found'; end if;
  return jsonb_build_object('saved_search_id',p_search_id,'alerts_enabled',coalesce(p_enabled,false));
end;
$$;

create or replace function public.it_delete_my_saved_search_v1(p_search_id uuid)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_rows integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  delete from public.it_saved_searches where id=p_search_id and user_id=v_uid;
  get diagnostics v_rows=row_count;
  if v_rows=0 then raise exception 'saved_search_not_found'; end if;
  return jsonb_build_object('deleted',true,'saved_search_id',p_search_id);
end;
$$;

create or replace function public.it_mark_all_saved_searches_seen_v1()
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare v_uid uuid:=auth.uid(); v_rows integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.it_saved_search_hits set seen_at=now() where user_id=v_uid and seen_at is null;
  get diagnostics v_rows=row_count;
  return jsonb_build_object('marked_seen',v_rows);
end;
$$;

revoke all on function public.it_saved_search_execute_v1(text,jsonb,integer) from public,anon;
revoke all on function public.it_save_my_search_v1(text,text,jsonb,boolean) from public,anon;
revoke all on function public.it_my_saved_searches_v1() from public,anon;
revoke all on function public.it_refresh_my_saved_searches_v1() from public,anon;
revoke all on function public.it_run_my_saved_search_v1(uuid) from public,anon;
revoke all on function public.it_set_my_saved_search_alerts_v1(uuid,boolean) from public,anon;
revoke all on function public.it_delete_my_saved_search_v1(uuid) from public,anon;
revoke all on function public.it_mark_all_saved_searches_seen_v1() from public,anon;

grant execute on function public.it_saved_search_execute_v1(text,jsonb,integer) to authenticated;
grant execute on function public.it_save_my_search_v1(text,text,jsonb,boolean) to authenticated;
grant execute on function public.it_my_saved_searches_v1() to authenticated;
grant execute on function public.it_refresh_my_saved_searches_v1() to authenticated;
grant execute on function public.it_run_my_saved_search_v1(uuid) to authenticated;
grant execute on function public.it_set_my_saved_search_alerts_v1(uuid,boolean) to authenticated;
grant execute on function public.it_delete_my_saved_search_v1(uuid) to authenticated;
grant execute on function public.it_mark_all_saved_searches_seen_v1() to authenticated;
