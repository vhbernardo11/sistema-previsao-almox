create table if not exists public.it_analytics_events (
  id bigint generated always as identity primary key,
  created_at timestamptz not null default now(),
  event_type text not null check (event_type in ('landing','share_action')),
  source text not null default 'direct' check (char_length(source) between 1 and 120),
  medium text null check (medium is null or char_length(medium) <= 120),
  campaign text null check (campaign is null or char_length(campaign) <= 180),
  channel text null check (channel is null or char_length(channel) <= 32),
  entity_type text null check (entity_type is null or entity_type in ('opportunity','professional')),
  entity_id uuid null,
  landing_path text null check (landing_path is null or char_length(landing_path) <= 500),
  referrer_host text null check (referrer_host is null or char_length(referrer_host) <= 180),
  session_key uuid not null,
  constraint it_analytics_events_entity_pair_chk check (
    (entity_type is null and entity_id is null) or
    (entity_type is not null and entity_id is not null)
  )
);

comment on table public.it_analytics_events is 'IntegraTrampo Stage 17: anonymous acquisition/share events. No IP, email, phone or user-agent is stored.';

alter table public.it_analytics_events enable row level security;
revoke all on table public.it_analytics_events from anon, authenticated;
revoke all on sequence public.it_analytics_events_id_seq from anon, authenticated;

grant select, insert, delete on table public.it_analytics_events to service_role;
grant usage, select on sequence public.it_analytics_events_id_seq to service_role;

create index if not exists it_analytics_events_created_at_idx
  on public.it_analytics_events (created_at desc);
create index if not exists it_analytics_events_event_created_idx
  on public.it_analytics_events (event_type, created_at desc);
create index if not exists it_analytics_events_source_created_idx
  on public.it_analytics_events (source, created_at desc);
create index if not exists it_analytics_events_entity_created_idx
  on public.it_analytics_events (entity_type, entity_id, created_at desc);
create index if not exists it_analytics_events_session_created_idx
  on public.it_analytics_events (session_key, created_at desc);
create unique index if not exists it_analytics_events_landing_dedupe_idx
  on public.it_analytics_events (
    session_key,
    coalesce(source,''),
    coalesce(medium,''),
    coalesce(campaign,''),
    coalesce(entity_type,''),
    coalesce(entity_id::text,'')
  )
  where event_type='landing';

create or replace function public.it_track_public_event_v1(
  p_event_type text,
  p_source text default null,
  p_medium text default null,
  p_campaign text default null,
  p_channel text default null,
  p_entity_type text default null,
  p_entity_id uuid default null,
  p_landing_path text default null,
  p_referrer_host text default null,
  p_session_key uuid default null
)
returns boolean
language plpgsql
security definer
set search_path=''
as $$
declare
  v_event text := lower(trim(coalesce(p_event_type,'')));
  v_source text := lower(left(trim(coalesce(p_source,'direct')),120));
  v_medium text := nullif(lower(left(trim(coalesce(p_medium,'')),120)),'');
  v_campaign text := nullif(left(trim(coalesce(p_campaign,'')),180),'');
  v_channel text := nullif(lower(left(trim(coalesce(p_channel,'')),32)),'');
  v_entity_type text := nullif(lower(left(trim(coalesce(p_entity_type,'')),32)),'');
  v_entity_id uuid := p_entity_id;
  v_path text := nullif(left(trim(coalesce(p_landing_path,'')),500),'');
  v_referrer text := nullif(lower(left(split_part(regexp_replace(trim(coalesce(p_referrer_host,'')),'^https?://','','i'),'/',1),180)),'');
  v_recent integer;
begin
  if v_event not in ('landing','share_action') then
    return false;
  end if;

  if p_session_key is null then
    return false;
  end if;

  if v_source='' then v_source:='direct'; end if;

  if v_entity_type not in ('opportunity','professional') then
    v_entity_type:=null;
    v_entity_id:=null;
  end if;

  if v_entity_type='opportunity' and not exists (
    select 1 from public.it_opportunities o where o.id=v_entity_id and o.status='published'
  ) then
    v_entity_type:=null; v_entity_id:=null;
  elsif v_entity_type='professional' and not exists (
    select 1 from public.it_public_professionals p where p.id=v_entity_id and p.is_published=true
  ) then
    v_entity_type:=null; v_entity_id:=null;
  end if;

  if v_event='share_action' then
    if v_channel not in ('whatsapp','facebook','x','linkedin','native','copy','share','other') then
      v_channel:='other';
    end if;
  else
    v_channel:=null;
  end if;

  select count(*)::integer into v_recent
  from public.it_analytics_events e
  where e.session_key=p_session_key
    and e.created_at > now()-interval '1 minute';
  if v_recent >= 30 then
    return false;
  end if;

  insert into public.it_analytics_events(
    event_type,source,medium,campaign,channel,entity_type,entity_id,landing_path,referrer_host,session_key
  ) values (
    v_event,v_source,v_medium,v_campaign,v_channel,v_entity_type,v_entity_id,v_path,v_referrer,p_session_key
  )
  on conflict do nothing;

  return true;
end;
$$;

revoke all on function public.it_track_public_event_v1(text,text,text,text,text,text,uuid,text,text,uuid) from public;
grant execute on function public.it_track_public_event_v1(text,text,text,text,text,text,uuid,text,text,uuid) to anon, authenticated, service_role;

create or replace function public.it_admin_acquisition_analytics_v1(
  p_token text,
  p_days integer default 30
)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_admin uuid;
  v_days integer := least(greatest(coalesce(p_days,30),1),90);
  v_requested_since timestamptz;
  v_tracking_start timestamptz;
  v_since timestamptz;
  v_result jsonb;
begin
  v_admin:=public.it_admin_session_admin_id(p_token);
  if v_admin is null then
    raise exception 'unauthorized' using errcode='42501';
  end if;

  v_requested_since:=now()-make_interval(days=>v_days);
  select min(e.created_at) into v_tracking_start from public.it_analytics_events e;
  v_since:=greatest(v_requested_since,coalesce(v_tracking_start,now()));

  with
  summary as (
    select
      (select count(distinct e.session_key) from public.it_analytics_events e where e.event_type='landing' and e.created_at>=v_since) as sessions,
      (select count(distinct e.session_key) from public.it_analytics_events e where e.event_type='landing' and e.medium='share' and e.created_at>=v_since) as shared_sessions,
      (select count(*) from public.it_analytics_events e where e.event_type='share_action' and e.created_at>=v_since) as share_clicks,
      (select count(*) from public.it_professional_signups s where s.created_at>=v_since) as professional_signups,
      (select count(*) from public.it_hiring_requests h where h.created_at>=v_since) as hiring_requests
  ),
  source_sessions as (
    select e.source, count(distinct e.session_key)::bigint as sessions
    from public.it_analytics_events e
    where e.event_type='landing' and e.created_at>=v_since
    group by e.source
  ),
  source_pros as (
    select lower(coalesce(nullif(trim(s.acquisition_source),''),'direct')) as source, count(*)::bigint as professional_signups
    from public.it_professional_signups s
    where s.created_at>=v_since
    group by 1
  ),
  source_hires as (
    select lower(coalesce(nullif(trim(h.acquisition_source),''),'direct')) as source, count(*)::bigint as hiring_requests
    from public.it_hiring_requests h
    where h.created_at>=v_since
    group by 1
  ),
  source_keys as (
    select source from source_sessions union select source from source_pros union select source from source_hires
  ),
  source_rows as (
    select k.source,
           coalesce(ss.sessions,0) as sessions,
           coalesce(sp.professional_signups,0) as professional_signups,
           coalesce(sh.hiring_requests,0) as hiring_requests,
           coalesce(sp.professional_signups,0)+coalesce(sh.hiring_requests,0) as conversions
    from source_keys k
    left join source_sessions ss using(source)
    left join source_pros sp using(source)
    left join source_hires sh using(source)
    order by sessions desc, conversions desc, source
    limit 12
  ),
  channel_rows as (
    select coalesce(e.channel,'other') as channel, count(*)::bigint as clicks
    from public.it_analytics_events e
    where e.event_type='share_action' and e.created_at>=v_since
    group by 1
    order by clicks desc, channel
  ),
  content_base as (
    select e.entity_type,e.entity_id,
           count(distinct e.session_key) filter(where e.event_type='landing')::bigint as sessions,
           count(*) filter(where e.event_type='share_action')::bigint as share_clicks
    from public.it_analytics_events e
    where e.created_at>=v_since and e.entity_type is not null and e.entity_id is not null
    group by e.entity_type,e.entity_id
  ),
  content_rows as (
    select cb.entity_type,cb.entity_id,
           case when cb.entity_type='opportunity' then coalesce(o.title,'Vaga') else coalesce(p.display_name,'Profissional') end as label,
           cb.sessions,cb.share_clicks
    from content_base cb
    left join public.it_opportunities o on cb.entity_type='opportunity' and o.id=cb.entity_id
    left join public.it_public_professionals p on cb.entity_type='professional' and p.id=cb.entity_id
    order by (cb.sessions+cb.share_clicks) desc, cb.sessions desc
    limit 12
  ),
  day_series as (
    select generate_series(
      (v_since at time zone 'America/Sao_Paulo')::date,
      (now() at time zone 'America/Sao_Paulo')::date,
      interval '1 day'
    )::date as day
  ),
  day_events as (
    select (e.created_at at time zone 'America/Sao_Paulo')::date as day,
           count(distinct e.session_key) filter(where e.event_type='landing')::bigint as sessions,
           count(*) filter(where e.event_type='share_action')::bigint as share_clicks,
           count(distinct e.session_key) filter(where e.event_type='landing' and e.medium='share')::bigint as shared_sessions
    from public.it_analytics_events e
    where e.created_at>=v_since
    group by 1
  ),
  day_pros as (
    select (s.created_at at time zone 'America/Sao_Paulo')::date as day,count(*)::bigint as professional_signups
    from public.it_professional_signups s where s.created_at>=v_since group by 1
  ),
  day_hires as (
    select (h.created_at at time zone 'America/Sao_Paulo')::date as day,count(*)::bigint as hiring_requests
    from public.it_hiring_requests h where h.created_at>=v_since group by 1
  ),
  daily_rows as (
    select d.day,
           coalesce(de.sessions,0) as sessions,
           coalesce(de.shared_sessions,0) as shared_sessions,
           coalesce(de.share_clicks,0) as share_clicks,
           coalesce(dp.professional_signups,0) as professional_signups,
           coalesce(dh.hiring_requests,0) as hiring_requests
    from day_series d
    left join day_events de using(day)
    left join day_pros dp using(day)
    left join day_hires dh using(day)
    order by d.day
  )
  select jsonb_build_object(
    'window_days',v_days,
    'tracking_started_at',v_tracking_start,
    'effective_since',v_since,
    'summary',(select jsonb_build_object(
      'sessions',s.sessions,
      'shared_sessions',s.shared_sessions,
      'share_clicks',s.share_clicks,
      'professional_signups',s.professional_signups,
      'hiring_requests',s.hiring_requests,
      'conversions',s.professional_signups+s.hiring_requests,
      'conversion_rate',case when s.sessions>0 then round(((s.professional_signups+s.hiring_requests)::numeric*100)/s.sessions,1) else 0 end
    ) from summary s),
    'sources',coalesce((select jsonb_agg(to_jsonb(x)) from source_rows x),'[]'::jsonb),
    'channels',coalesce((select jsonb_agg(to_jsonb(x)) from channel_rows x),'[]'::jsonb),
    'content',coalesce((select jsonb_agg(to_jsonb(x)) from content_rows x),'[]'::jsonb),
    'daily',coalesce((select jsonb_agg(to_jsonb(x)) from daily_rows x),'[]'::jsonb)
  ) into v_result;

  return v_result;
end;
$$;

revoke all on function public.it_admin_acquisition_analytics_v1(text,integer) from public;
grant execute on function public.it_admin_acquisition_analytics_v1(text,integer) to anon, authenticated, service_role;
