-- IntegraTrampo pre-Stage 11 hardening audit
-- Overnight schedules, least-privilege grants and payment RLS performance.

alter table public.it_opportunities
  drop constraint if exists it_opportunities_time_pair_check,
  drop constraint if exists it_opportunities_daily_rate_max_check,
  drop constraint if exists it_opportunities_vacancies_max_check,
  drop constraint if exists it_opportunities_description_length_check;

alter table public.it_opportunities
  add constraint it_opportunities_time_pair_check
    check ((start_time is null and end_time is null) or (start_time is not null and end_time is not null and start_time <> end_time)),
  add constraint it_opportunities_daily_rate_max_check
    check (daily_rate is null or daily_rate <= 1000000),
  add constraint it_opportunities_vacancies_max_check
    check (vacancies <= 1000),
  add constraint it_opportunities_description_length_check
    check (description is null or char_length(description) <= 5000);

create or replace function public.it_professional_has_service_conflict_v1(
  p_professional_id uuid,
  p_service_date date,
  p_start_time time without time zone default null,
  p_end_time time without time zone default null,
  p_exclude_service_id uuid default null
)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  with proposed as (
    select
      case
        when p_service_date is null then null::timestamp
        when p_start_time is null or p_end_time is null then p_service_date::timestamp
        else p_service_date::timestamp + p_start_time
      end as start_at,
      case
        when p_service_date is null then null::timestamp
        when p_start_time is null or p_end_time is null then p_service_date::timestamp + interval '1 day'
        when p_end_time > p_start_time then p_service_date::timestamp + p_end_time
        else p_service_date::timestamp + p_end_time + interval '1 day'
      end as end_at
  ), existing as (
    select
      s.id,
      coalesce(o.service_date,d.service_date) as service_date,
      coalesce(o.start_time,d.start_time) as start_time,
      coalesce(o.end_time,d.end_time) as end_time
    from public.it_services s
    left join public.it_opportunities o on o.id=s.opportunity_id
    left join public.it_direct_offers d on d.service_id=s.id
    where s.professional_id=p_professional_id
      and s.status in ('awaiting_confirmation','confirmed')
      and (p_exclude_service_id is null or s.id<>p_exclude_service_id)
  ), existing_intervals as (
    select
      id,
      case
        when service_date is null then null::timestamp
        when start_time is null or end_time is null then service_date::timestamp
        else service_date::timestamp + start_time
      end as start_at,
      case
        when service_date is null then null::timestamp
        when start_time is null or end_time is null then service_date::timestamp + interval '1 day'
        when end_time > start_time then service_date::timestamp + end_time
        else service_date::timestamp + end_time + interval '1 day'
      end as end_at
    from existing
  )
  select exists(
    select 1
    from proposed p
    join existing_intervals e on e.start_at is not null
    where p.start_at is not null
      and p.start_at < e.end_at
      and p.end_at > e.start_at
  );
$$;

revoke all on function public.it_professional_has_service_conflict_v1(uuid,date,time without time zone,time without time zone,uuid) from public, anon, authenticated;

create or replace function public.it_create_my_opportunity(
  p_title text, p_category text, p_description text, p_city text,
  p_service_date date, p_start_time time without time zone, p_end_time time without time zone,
  p_daily_rate numeric, p_vacancies integer
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_company_id uuid;
  v_id uuid;
  v_title text:=btrim(coalesce(p_title,''));
  v_category text:=btrim(coalesce(p_category,''));
  v_city text:=btrim(coalesce(p_city,''));
  v_description text:=nullif(btrim(coalesce(p_description,'')),'');
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if char_length(v_title)<2 or char_length(v_title)>160 then raise exception 'invalid_opportunity_title'; end if;
  if char_length(v_category)<2 or char_length(v_category)>120 then raise exception 'invalid_opportunity_category'; end if;
  if char_length(v_city)<2 or char_length(v_city)>120 then raise exception 'invalid_opportunity_city'; end if;
  if v_description is not null and char_length(v_description)>5000 then raise exception 'description_too_long'; end if;
  if coalesce(p_vacancies,0)<1 or p_vacancies>1000 then raise exception 'invalid_vacancies'; end if;
  if p_daily_rate is not null and (p_daily_rate<0 or p_daily_rate>1000000) then raise exception 'invalid_daily_rate'; end if;
  if p_service_date is not null and p_service_date<current_date then raise exception 'invalid_service_date'; end if;
  if (p_start_time is null) <> (p_end_time is null) then raise exception 'incomplete_time_range'; end if;
  if p_start_time is not null and p_start_time=p_end_time then raise exception 'invalid_time_range'; end if;

  select id into v_company_id
  from public.it_companies
  where user_id=v_uid
  order by created_at asc limit 1;
  if v_company_id is null then raise exception 'company_not_found'; end if;

  insert into public.it_opportunities(company_id,title,category,description,city,service_date,start_time,end_time,daily_rate,vacancies,status)
  values(v_company_id,v_title,v_category,v_description,v_city,p_service_date,p_start_time,p_end_time,p_daily_rate,p_vacancies,'draft')
  returning id into v_id;
  return v_id;
end;
$$;
revoke all on function public.it_create_my_opportunity(text,text,text,text,date,time without time zone,time without time zone,numeric,integer) from public, anon;
grant execute on function public.it_create_my_opportunity(text,text,text,text,date,time without time zone,time without time zone,numeric,integer) to authenticated;

create or replace function public.it_update_my_opportunity(
  p_id uuid, p_title text, p_category text, p_description text, p_city text,
  p_service_date date, p_start_time time without time zone, p_end_time time without time zone,
  p_daily_rate numeric, p_vacancies integer
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_title text:=btrim(coalesce(p_title,''));
  v_category text:=btrim(coalesce(p_category,''));
  v_city text:=btrim(coalesce(p_city,''));
  v_description text:=nullif(btrim(coalesce(p_description,'')),'');
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if char_length(v_title)<2 or char_length(v_title)>160 then raise exception 'invalid_opportunity_title'; end if;
  if char_length(v_category)<2 or char_length(v_category)>120 then raise exception 'invalid_opportunity_category'; end if;
  if char_length(v_city)<2 or char_length(v_city)>120 then raise exception 'invalid_opportunity_city'; end if;
  if v_description is not null and char_length(v_description)>5000 then raise exception 'description_too_long'; end if;
  if coalesce(p_vacancies,0)<1 or p_vacancies>1000 then raise exception 'invalid_vacancies'; end if;
  if p_daily_rate is not null and (p_daily_rate<0 or p_daily_rate>1000000) then raise exception 'invalid_daily_rate'; end if;
  if p_service_date is not null and p_service_date<current_date then raise exception 'invalid_service_date'; end if;
  if (p_start_time is null) <> (p_end_time is null) then raise exception 'incomplete_time_range'; end if;
  if p_start_time is not null and p_start_time=p_end_time then raise exception 'invalid_time_range'; end if;

  update public.it_opportunities o
     set title=v_title,category=v_category,description=v_description,city=v_city,
         service_date=p_service_date,start_time=p_start_time,end_time=p_end_time,
         daily_rate=p_daily_rate,vacancies=p_vacancies
   where o.id=p_id and o.status='draft'
     and exists(select 1 from public.it_companies c where c.id=o.company_id and c.user_id=v_uid);
  if not found then raise exception 'opportunity_not_editable'; end if;
  return true;
end;
$$;
revoke all on function public.it_update_my_opportunity(uuid,text,text,text,text,date,time without time zone,time without time zone,numeric,integer) from public, anon;
grant execute on function public.it_update_my_opportunity(uuid,text,text,text,text,date,time without time zone,time without time zone,numeric,integer) to authenticated;

create or replace function public.it_create_direct_offer_v1(
  p_professional_id uuid, p_title text, p_category text, p_description text, p_city text,
  p_service_date date, p_start_time time without time zone, p_end_time time without time zone,
  p_daily_rate numeric
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid:=auth.uid();
  v_company public.it_companies%rowtype;
  v_prof public.it_public_professionals%rowtype;
  v_id uuid;
  v_title text:=trim(coalesce(p_title,''));
  v_category text:=trim(coalesce(p_category,''));
  v_city text:=trim(coalesce(p_city,''));
  v_desc text:=nullif(trim(coalesce(p_description,'')),'');
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_company from public.it_companies where user_id=v_uid and is_published=true order by created_at asc limit 1;
  if v_company.id is null then raise exception 'published_company_required'; end if;
  select * into v_prof from public.it_public_professionals where id=p_professional_id and is_published=true;
  if v_prof.id is null or v_prof.user_id is null then raise exception 'professional_not_available'; end if;
  if v_prof.user_id=v_uid then raise exception 'cannot_hire_yourself'; end if;
  if char_length(v_title) not between 3 and 120 then raise exception 'invalid_title'; end if;
  if char_length(v_category) not between 2 and 120 then raise exception 'invalid_category'; end if;
  if char_length(v_city) not between 2 and 120 then raise exception 'invalid_city'; end if;
  if v_desc is not null and char_length(v_desc)>2000 then raise exception 'description_too_long'; end if;
  if p_service_date is null or p_service_date<current_date then raise exception 'invalid_service_date'; end if;
  if (p_start_time is null) <> (p_end_time is null) then raise exception 'incomplete_time_range'; end if;
  if p_start_time is not null and p_start_time=p_end_time then raise exception 'invalid_time_range'; end if;
  if p_daily_rate is null or p_daily_rate<=0 or p_daily_rate>1000000 then raise exception 'invalid_daily_rate'; end if;

  begin
    insert into public.it_direct_offers(company_id,professional_id,title,category,description,city,service_date,start_time,end_time,daily_rate)
    values(v_company.id,v_prof.id,v_title,v_category,v_desc,v_city,p_service_date,p_start_time,p_end_time,round(p_daily_rate,2))
    returning id into v_id;
  exception when unique_violation then
    raise exception 'duplicate_pending_offer';
  end;

  insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
  values(v_prof.user_id,'direct_offer_received','Nova proposta direta','Um contratante enviou uma proposta de serviço diretamente para você.','direct_offer',v_id);
  return jsonb_build_object('ok',true,'offer_id',v_id,'status','pending');
end;
$$;
revoke all on function public.it_create_direct_offer_v1(uuid,text,text,text,text,date,time without time zone,time without time zone,numeric) from public, anon;
grant execute on function public.it_create_direct_offer_v1(uuid,text,text,text,text,date,time without time zone,time without time zone,numeric) to authenticated;

drop policy if exists it_incidents_participant_insert on public.it_incidents;
revoke all on table public.it_incidents from anon, authenticated;
grant select on table public.it_incidents to authenticated;

revoke all on table public.it_reviews from anon, authenticated;
grant select on table public.it_reviews to anon, authenticated;

revoke all on table public.it_applications from anon, authenticated;
grant select, insert on table public.it_applications to authenticated;

revoke all on table public.it_companies from anon, authenticated;
grant select on table public.it_companies to anon, authenticated;
revoke all on table public.it_opportunities from anon, authenticated;
grant select on table public.it_opportunities to anon, authenticated;
revoke all on table public.it_public_professionals from anon, authenticated;
grant select on table public.it_public_professionals to anon, authenticated;
revoke all on table public.it_services from anon, authenticated;
grant select on table public.it_services to authenticated;
revoke all on table public.it_direct_offers from anon, authenticated;
grant select on table public.it_direct_offers to authenticated;
revoke all on table public.it_service_payments from anon, authenticated;
grant select on table public.it_service_payments to authenticated;
revoke all on table public.it_notifications from anon, authenticated;
grant select on table public.it_notifications to authenticated;
revoke all on table public.it_public_metrics_cache from anon, authenticated;
grant select on table public.it_public_metrics_cache to anon, authenticated;

revoke all on table public.it_admin_audit from anon, authenticated;
revoke all on table public.it_admin_credentials from anon, authenticated;
revoke all on table public.it_admin_sessions from anon, authenticated;
revoke all on table public.it_whatsapp_outbox from anon, authenticated;

drop policy if exists it_service_payments_participant_select on public.it_service_payments;
create policy it_service_payments_participant_select on public.it_service_payments
for select to authenticated
using ((select auth.uid()) = company_user_id or (select auth.uid()) = professional_user_id);
