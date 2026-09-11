-- IntegraTrampo · Etapa 13 · alertas inteligentes de afinidade
-- Alertas internos e configuráveis a partir do ranking explicável da Etapa 12.

create table if not exists public.it_recommendation_alert_preferences (
  user_id uuid primary key references auth.users(id) on delete cascade,
  enabled boolean not null default true,
  min_score integer not null default 75 check (min_score between 50 and 100),
  alert_opportunities boolean not null default true,
  alert_professionals boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.it_recommendation_alert_preferences enable row level security;
revoke all on table public.it_recommendation_alert_preferences from anon;
revoke all on table public.it_recommendation_alert_preferences from public;
grant select, insert, update on table public.it_recommendation_alert_preferences to authenticated;

drop policy if exists it_recommendation_alert_preferences_own_select on public.it_recommendation_alert_preferences;
create policy it_recommendation_alert_preferences_own_select on public.it_recommendation_alert_preferences
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists it_recommendation_alert_preferences_own_insert on public.it_recommendation_alert_preferences;
create policy it_recommendation_alert_preferences_own_insert on public.it_recommendation_alert_preferences
for insert to authenticated with check ((select auth.uid()) = user_id);

drop policy if exists it_recommendation_alert_preferences_own_update on public.it_recommendation_alert_preferences;
create policy it_recommendation_alert_preferences_own_update on public.it_recommendation_alert_preferences
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create table if not exists public.it_recommendation_alert_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  entity_type text not null check (entity_type in ('opportunity','professional')),
  entity_id uuid not null,
  affinity_score integer not null check (affinity_score between 0 and 100),
  title text not null check (char_length(title) between 1 and 200),
  body text not null check (char_length(body) between 1 and 500),
  reasons jsonb not null default '[]'::jsonb check (jsonb_typeof(reasons) = 'array'),
  created_at timestamptz not null default now(),
  read_at timestamptz,
  unique(user_id, entity_type, entity_id)
);

create index if not exists it_recommendation_alert_events_user_created_idx on public.it_recommendation_alert_events(user_id, created_at desc);
create index if not exists it_recommendation_alert_events_user_unread_idx on public.it_recommendation_alert_events(user_id, created_at desc) where read_at is null;

alter table public.it_recommendation_alert_events enable row level security;
revoke all on table public.it_recommendation_alert_events from anon;
revoke all on table public.it_recommendation_alert_events from public;
grant select, insert, update on table public.it_recommendation_alert_events to authenticated;

drop policy if exists it_recommendation_alert_events_own_select on public.it_recommendation_alert_events;
create policy it_recommendation_alert_events_own_select on public.it_recommendation_alert_events
for select to authenticated using ((select auth.uid()) = user_id);

drop policy if exists it_recommendation_alert_events_own_insert on public.it_recommendation_alert_events;
create policy it_recommendation_alert_events_own_insert on public.it_recommendation_alert_events
for insert to authenticated with check ((select auth.uid()) = user_id and read_at is null);

drop policy if exists it_recommendation_alert_events_own_update on public.it_recommendation_alert_events;
create policy it_recommendation_alert_events_own_update on public.it_recommendation_alert_events
for update to authenticated using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);

create or replace function public.it_my_recommendation_alert_settings_v1()
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_row public.it_recommendation_alert_preferences%rowtype;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  select * into v_row from public.it_recommendation_alert_preferences where user_id=v_uid;
  return jsonb_build_object(
    'enabled',coalesce(v_row.enabled,true),
    'min_score',coalesce(v_row.min_score,75),
    'alert_opportunities',coalesce(v_row.alert_opportunities,true),
    'alert_professionals',coalesce(v_row.alert_professionals,true),
    'updated_at',v_row.updated_at
  );
end;
$$;

revoke all on function public.it_my_recommendation_alert_settings_v1() from public, anon;
grant execute on function public.it_my_recommendation_alert_settings_v1() to authenticated;

create or replace function public.it_set_my_recommendation_alert_settings_v1(
  p_enabled boolean,
  p_min_score integer,
  p_alert_opportunities boolean,
  p_alert_professionals boolean
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_score integer := coalesce(p_min_score,75);
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  if v_score < 50 or v_score > 100 then raise exception 'invalid_min_score'; end if;

  insert into public.it_recommendation_alert_preferences(user_id,enabled,min_score,alert_opportunities,alert_professionals,updated_at)
  values(v_uid,coalesce(p_enabled,true),v_score,coalesce(p_alert_opportunities,true),coalesce(p_alert_professionals,true),now())
  on conflict(user_id) do update set
    enabled=excluded.enabled,
    min_score=excluded.min_score,
    alert_opportunities=excluded.alert_opportunities,
    alert_professionals=excluded.alert_professionals,
    updated_at=now();

  return public.it_my_recommendation_alert_settings_v1();
end;
$$;

revoke all on function public.it_set_my_recommendation_alert_settings_v1(boolean,integer,boolean,boolean) from public, anon;
grant execute on function public.it_set_my_recommendation_alert_settings_v1(boolean,integer,boolean,boolean) to authenticated;

create or replace function public.it_refresh_my_recommendation_alerts_v1(p_limit integer default 3)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,3),10));
  v_enabled boolean := true;
  v_min_score integer := 75;
  v_alert_opportunities boolean := true;
  v_alert_professionals boolean := true;
  v_recs jsonb;
  v_created jsonb := '[]'::jsonb;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;

  select enabled,min_score,alert_opportunities,alert_professionals
  into v_enabled,v_min_score,v_alert_opportunities,v_alert_professionals
  from public.it_recommendation_alert_preferences
  where user_id=v_uid;

  v_enabled := coalesce(v_enabled,true);
  v_min_score := coalesce(v_min_score,75);
  v_alert_opportunities := coalesce(v_alert_opportunities,true);
  v_alert_professionals := coalesce(v_alert_professionals,true);

  if not v_enabled or (not v_alert_opportunities and not v_alert_professionals) then
    return jsonb_build_object('enabled',v_enabled,'created_count',0,'created','[]'::jsonb,'min_score',v_min_score);
  end if;

  v_recs := public.it_my_recommendations_v1(20);

  with candidates as (
    select
      'opportunity'::text as entity_type,
      (j->>'id')::uuid as entity_id,
      coalesce((j->>'affinity_score')::integer,0) as affinity_score,
      left('Vaga recomendada: '||coalesce(j->>'title','Oportunidade'),200)::text as title,
      left('Afinidade '||coalesce(j->>'affinity_score','0')||'/100 · '||coalesce(j->>'company_name','Contratante')||case when nullif(j->>'city','') is not null then ' · '||(j->>'city') else '' end,500)::text as body,
      coalesce(j->'reasons','[]'::jsonb) as reasons
    from jsonb_array_elements(coalesce(v_recs->'opportunities','[]'::jsonb)) j
    where v_alert_opportunities and coalesce((j->>'affinity_score')::integer,0) >= v_min_score

    union all

    select
      'professional'::text,
      (p->>'id')::uuid,
      coalesce((p->>'affinity_score')::integer,0),
      left('Profissional recomendado: '||coalesce(p->>'display_name','Profissional'),200)::text,
      left('Afinidade '||coalesce(p->>'affinity_score','0')||'/100 · '||coalesce(p->>'role_title','Profissional')||case when nullif(p->>'city','') is not null then ' · '||(p->>'city') else '' end,500)::text,
      coalesce(p->'reasons','[]'::jsonb)
    from jsonb_array_elements(coalesce(v_recs->'professionals','[]'::jsonb)) p
    where v_alert_professionals and coalesce((p->>'affinity_score')::integer,0) >= v_min_score
  ), picked as (
    select * from candidates
    order by affinity_score desc, entity_type, entity_id
    limit v_limit
  ), inserted as (
    insert into public.it_recommendation_alert_events(user_id,entity_type,entity_id,affinity_score,title,body,reasons)
    select v_uid,entity_type,entity_id,affinity_score,title,body,reasons
    from picked
    on conflict(user_id,entity_type,entity_id) do nothing
    returning id,entity_type,entity_id,affinity_score,title,body,reasons,created_at,read_at
  )
  select coalesce(jsonb_agg(to_jsonb(inserted) order by affinity_score desc,created_at desc),'[]'::jsonb)
  into v_created
  from inserted;

  return jsonb_build_object(
    'enabled',v_enabled,
    'min_score',v_min_score,
    'created_count',jsonb_array_length(v_created),
    'created',v_created
  );
end;
$$;

revoke all on function public.it_refresh_my_recommendation_alerts_v1(integer) from public, anon;
grant execute on function public.it_refresh_my_recommendation_alerts_v1(integer) to authenticated;

create or replace function public.it_my_recommendation_alerts_v1(p_limit integer default 30)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1,least(coalesce(p_limit,30),100));
  v_settings jsonb;
  v_alerts jsonb;
  v_unread integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  v_settings := public.it_my_recommendation_alert_settings_v1();
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb)
  into v_alerts
  from (
    select id,created_at,entity_type,entity_id,affinity_score,title,body,reasons,read_at
    from public.it_recommendation_alert_events
    where user_id=v_uid
    order by created_at desc
    limit v_limit
  ) x;
  select count(*)::integer into v_unread from public.it_recommendation_alert_events where user_id=v_uid and read_at is null;
  return jsonb_build_object('settings',v_settings,'alerts',v_alerts,'unread',coalesce(v_unread,0));
end;
$$;

revoke all on function public.it_my_recommendation_alerts_v1(integer) from public, anon;
grant execute on function public.it_my_recommendation_alerts_v1(integer) to authenticated;

create or replace function public.it_mark_recommendation_alert_read_v1(p_alert_id uuid default null)
returns integer
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_count integer;
begin
  if v_uid is null then raise exception 'not_authenticated'; end if;
  update public.it_recommendation_alert_events
  set read_at=coalesce(read_at,now())
  where user_id=v_uid and read_at is null and (p_alert_id is null or id=p_alert_id);
  get diagnostics v_count = row_count;
  return v_count;
end;
$$;

revoke all on function public.it_mark_recommendation_alert_read_v1(uuid) from public, anon;
grant execute on function public.it_mark_recommendation_alert_read_v1(uuid) to authenticated;
