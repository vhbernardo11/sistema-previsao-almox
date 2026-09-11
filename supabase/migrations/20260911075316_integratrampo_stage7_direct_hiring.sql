create table if not exists public.it_direct_offers (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  company_id uuid not null references public.it_companies(id) on delete cascade,
  professional_id uuid not null references public.it_public_professionals(id) on delete cascade,
  title text not null check (char_length(trim(title)) between 3 and 120),
  category text not null check (char_length(trim(category)) between 2 and 120),
  description text check (description is null or char_length(description) <= 2000),
  city text not null check (char_length(trim(city)) between 2 and 120),
  service_date date not null,
  start_time time,
  end_time time,
  daily_rate numeric(12,2) not null check (daily_rate > 0 and daily_rate <= 1000000),
  status text not null default 'pending' check (status in ('pending','accepted','declined','cancelled')),
  responded_at timestamptz,
  cancelled_at timestamptz,
  service_id uuid unique references public.it_services(id) on delete set null
);

create index if not exists it_direct_offers_company_idx on public.it_direct_offers(company_id, created_at desc);
create index if not exists it_direct_offers_professional_idx on public.it_direct_offers(professional_id, created_at desc);
create index if not exists it_direct_offers_status_idx on public.it_direct_offers(status, created_at desc);
create unique index if not exists it_direct_offers_pending_dedupe_idx on public.it_direct_offers(company_id,professional_id,service_date,title) where status='pending';

alter table public.it_direct_offers enable row level security;
drop policy if exists it_direct_offers_participant_select on public.it_direct_offers;
create policy it_direct_offers_participant_select on public.it_direct_offers for select to authenticated
using (
  exists(select 1 from public.it_companies c where c.id=company_id and c.user_id=(select auth.uid()))
  or exists(select 1 from public.it_public_professionals p where p.id=professional_id and p.user_id=(select auth.uid()))
);
revoke all on table public.it_direct_offers from anon;
revoke insert,update,delete on table public.it_direct_offers from authenticated;
grant select on table public.it_direct_offers to authenticated;

create or replace function public.it_create_direct_offer_v1(
  p_professional_id uuid,p_title text,p_category text,p_description text,p_city text,p_service_date date,p_start_time time,p_end_time time,p_daily_rate numeric
) returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid:=auth.uid();v_company public.it_companies%rowtype;v_prof public.it_public_professionals%rowtype;v_id uuid;
  v_title text:=trim(coalesce(p_title,''));v_category text:=trim(coalesce(p_category,''));v_city text:=trim(coalesce(p_city,''));v_desc text:=nullif(trim(coalesce(p_description,'')),'');
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
  if p_start_time is not null and p_end_time<=p_start_time then raise exception 'invalid_time_range'; end if;
  if p_daily_rate is null or p_daily_rate<=0 or p_daily_rate>1000000 then raise exception 'invalid_daily_rate'; end if;
  begin
    insert into public.it_direct_offers(company_id,professional_id,title,category,description,city,service_date,start_time,end_time,daily_rate)
    values(v_company.id,v_prof.id,v_title,v_category,v_desc,v_city,p_service_date,p_start_time,p_end_time,round(p_daily_rate,2)) returning id into v_id;
  exception when unique_violation then raise exception 'duplicate_pending_offer'; end;
  insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
  values(v_prof.user_id,'direct_offer_received','Nova proposta direta','Um contratante enviou uma proposta de serviço diretamente para você.','direct_offer',v_id);
  return jsonb_build_object('ok',true,'offer_id',v_id,'status','pending');
end;$$;

create or replace function public.it_respond_direct_offer_v1(p_offer_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid:=auth.uid();v_offer public.it_direct_offers%rowtype;v_prof_user uuid;v_company_user uuid;v_service_id uuid;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select d.* into v_offer from public.it_direct_offers d where d.id=p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found'; end if;
  select user_id into v_prof_user from public.it_public_professionals where id=v_offer.professional_id;
  if v_prof_user is distinct from v_uid then raise exception 'professional_only_action'; end if;
  if v_offer.status<>'pending' then raise exception 'offer_not_pending'; end if;
  if v_offer.service_date<current_date then raise exception 'offer_expired'; end if;
  select user_id into v_company_user from public.it_companies where id=v_offer.company_id;
  if p_accept then
    insert into public.it_services(company_id,professional_id,status) values(v_offer.company_id,v_offer.professional_id,'awaiting_confirmation') returning id into v_service_id;
    update public.it_direct_offers set status='accepted',responded_at=now(),updated_at=now(),service_id=v_service_id where id=p_offer_id;
    if v_company_user is not null then
      insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
      values(v_company_user,'direct_offer_accepted','Proposta aceita','O profissional aceitou sua proposta direta. O serviço agora está aguardando confirmação das duas partes.','service',v_service_id);
    end if;
    return jsonb_build_object('ok',true,'offer_id',p_offer_id,'status','accepted','service_id',v_service_id);
  else
    update public.it_direct_offers set status='declined',responded_at=now(),updated_at=now() where id=p_offer_id;
    if v_company_user is not null then
      insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
      values(v_company_user,'direct_offer_declined','Proposta recusada','O profissional não aceitou sua proposta direta.','direct_offer',p_offer_id);
    end if;
    return jsonb_build_object('ok',true,'offer_id',p_offer_id,'status','declined');
  end if;
end;$$;

create or replace function public.it_cancel_my_direct_offer_v1(p_offer_id uuid)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid:=auth.uid();v_offer public.it_direct_offers%rowtype;v_company_user uuid;v_prof_user uuid;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_offer from public.it_direct_offers where id=p_offer_id for update;
  if v_offer.id is null then raise exception 'offer_not_found'; end if;
  select user_id into v_company_user from public.it_companies where id=v_offer.company_id;
  if v_company_user is distinct from v_uid then raise exception 'company_only_action'; end if;
  if v_offer.status<>'pending' then raise exception 'offer_not_pending'; end if;
  update public.it_direct_offers set status='cancelled',cancelled_at=now(),updated_at=now() where id=p_offer_id;
  select user_id into v_prof_user from public.it_public_professionals where id=v_offer.professional_id;
  if v_prof_user is not null then
    insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
    values(v_prof_user,'direct_offer_cancelled','Proposta cancelada','O contratante cancelou uma proposta direta que ainda estava pendente.','direct_offer',p_offer_id);
  end if;
  return jsonb_build_object('ok',true,'offer_id',p_offer_id,'status','cancelled');
end;$$;

create or replace function public.it_my_direct_offers_v1()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid:=auth.uid();v_result jsonb;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_result
  from (
    select d.id,d.created_at,d.updated_at,d.status,d.title,d.category,d.description,d.city,d.service_date,d.start_time,d.end_time,d.daily_rate,d.responded_at,d.cancelled_at,d.service_id,
      case when p.user_id=v_uid then 'professional' else 'company' end as viewer_side,
      c.display_name as company_name,c.logo_url as company_logo_url,c.rating as company_rating,c.review_count as company_review_count,
      p.display_name as professional_name,p.photo_url as professional_photo_url,p.role_title as professional_role,p.rating as professional_rating,p.review_count as professional_review_count
    from public.it_direct_offers d join public.it_companies c on c.id=d.company_id join public.it_public_professionals p on p.id=d.professional_id
    where c.user_id=v_uid or p.user_id=v_uid
  ) x;
  return v_result;
end;$$;

create or replace function public.it_my_matches_v1()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid:=auth.uid();v_result jsonb;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.created_at desc),'[]'::jsonb) into v_result
  from (
    select s.id as service_id,s.created_at,s.status,s.opportunity_id,s.professional_id,s.company_id,s.professional_confirmed_at,s.company_confirmed_at,s.professional_completed_at,s.company_completed_at,s.completed_at,s.cancelled_at,s.cancelled_by_user_id,s.cancellation_reason,
      case when s.cancelled_by_user_id=p.user_id then 'professional' when s.cancelled_by_user_id=c.user_id then 'company' else null end as cancelled_by_side,
      case when p.user_id=v_uid then 'professional' else 'company' end as viewer_side,
      a.id as application_id,a.status as application_status,
      coalesce(o.title,d.title) as job_title,coalesce(o.category,d.category) as category,coalesce(o.description,d.description) as description,coalesce(o.city,d.city) as city,coalesce(o.service_date,d.service_date) as service_date,coalesce(o.start_time,d.start_time) as start_time,coalesce(o.end_time,d.end_time) as end_time,coalesce(o.daily_rate,d.daily_rate) as daily_rate,coalesce(o.vacancies,1) as vacancies,d.id as direct_offer_id,
      c.display_name as company_name,c.kind as company_kind,c.logo_url as company_logo_url,p.display_name as professional_name,p.role_title as professional_role,p.photo_url as professional_photo_url,p.rating as professional_rating,p.review_count as professional_review_count
    from public.it_services s left join public.it_opportunities o on o.id=s.opportunity_id left join public.it_direct_offers d on d.service_id=s.id left join public.it_companies c on c.id=s.company_id left join public.it_public_professionals p on p.id=s.professional_id
    left join lateral (select ia.id,ia.status from public.it_applications ia where ia.opportunity_id=s.opportunity_id and ia.professional_id=s.professional_id order by ia.created_at desc limit 1) a on true
    where p.user_id=v_uid or c.user_id=v_uid
  ) x;
  return v_result;
end;$$;

create or replace function public.it_queue_service_whatsapp_v1(p_service_id uuid,p_event_type text,p_recipient_side text,p_event_text text)
returns void language plpgsql security definer set search_path to 'public','auth' as $$
declare v_phone text;v_uid uuid;v_name text;v_job text;v_date text;v_key text;
begin
  if p_recipient_side not in ('professional','company') then return; end if;
  select coalesce(o.title,d.title),case when coalesce(o.service_date,d.service_date) is null then 'a combinar' else to_char(coalesce(o.service_date,d.service_date),'DD/MM/YYYY') end into v_job,v_date
  from public.it_services s left join public.it_opportunities o on o.id=s.opportunity_id left join public.it_direct_offers d on d.service_id=s.id where s.id=p_service_id;
  if not found then return; end if;
  if p_recipient_side='professional' then
    select pp.user_id,pp.display_name,public.it_normalize_whatsapp_phone_v1(coalesce(ps.whatsapp,au.phone)) into v_uid,v_name,v_phone
    from public.it_services s join public.it_public_professionals pp on pp.id=s.professional_id left join public.it_professional_signups ps on ps.id=pp.signup_id left join auth.users au on au.id=pp.user_id where s.id=p_service_id;
  else
    select c.user_id,c.display_name,public.it_normalize_whatsapp_phone_v1(coalesce(c.whatsapp,au.phone)) into v_uid,v_name,v_phone
    from public.it_services s join public.it_companies c on c.id=s.company_id left join auth.users au on au.id=c.user_id where s.id=p_service_id;
  end if;
  v_key:=p_service_id::text||':'||p_event_type||':'||p_recipient_side;
  insert into public.it_whatsapp_outbox(service_id,event_type,recipient_user_id,recipient_side,phone,payload,status,last_error,dedupe_key)
  values(p_service_id,p_event_type,v_uid,p_recipient_side,v_phone,jsonb_build_object('recipient_name',coalesce(v_name,case when p_recipient_side='professional' then 'Profissional' else 'Contratante' end),'event_text',p_event_text,'job_title',coalesce(v_job,'Serviço'),'service_date',coalesce(v_date,'a combinar'),'app_url','https://integratrampo-live-v3.vercel.app/'),case when v_phone is null then 'blocked' else 'pending' end,case when v_phone is null then 'whatsapp_phone_missing_or_invalid' else null end,v_key)
  on conflict(dedupe_key) do nothing;
end;$$;

create or replace function public.it_my_service_payments_v1()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid:=auth.uid();v_result jsonb;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb) into v_result
  from (
    select pay.service_id,pay.amount,pay.method,pay.status,pay.company_note,pay.professional_note,pay.reported_at,pay.confirmed_at,pay.disputed_at,pay.updated_at,
      case when pay.professional_user_id=v_uid then 'professional' else 'company' end as viewer_side,
      coalesce(o.title,d.title) as job_title,coalesce(o.category,d.category) as category,coalesce(o.service_date,d.service_date) as service_date,c.display_name as company_name,p.display_name as professional_name
    from public.it_service_payments pay join public.it_services s on s.id=pay.service_id left join public.it_opportunities o on o.id=s.opportunity_id left join public.it_direct_offers d on d.service_id=s.id left join public.it_companies c on c.id=s.company_id left join public.it_public_professionals p on p.id=s.professional_id
    where pay.company_user_id=v_uid or pay.professional_user_id=v_uid
  ) x;
  return v_result;
end;$$;

revoke all on function public.it_create_direct_offer_v1(uuid,text,text,text,text,date,time,time,numeric) from public,anon;
revoke all on function public.it_respond_direct_offer_v1(uuid,boolean) from public,anon;
revoke all on function public.it_cancel_my_direct_offer_v1(uuid) from public,anon;
revoke all on function public.it_my_direct_offers_v1() from public,anon;
grant execute on function public.it_create_direct_offer_v1(uuid,text,text,text,text,date,time,time,numeric) to authenticated;
grant execute on function public.it_respond_direct_offer_v1(uuid,boolean) to authenticated;
grant execute on function public.it_cancel_my_direct_offer_v1(uuid) to authenticated;
grant execute on function public.it_my_direct_offers_v1() to authenticated;
