create or replace function public.it_create_my_opportunity(p_title text, p_category text, p_description text, p_city text, p_service_date date, p_start_time time without time zone, p_end_time time without time zone, p_daily_rate numeric, p_vacancies integer)
returns uuid
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid:=auth.uid(); v_company_id uuid; v_id uuid; v_title text:=btrim(coalesce(p_title,'')); v_category text:=btrim(coalesce(p_category,'')); v_city text:=btrim(coalesce(p_city,''));
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if char_length(v_title)<2 or char_length(v_title)>160 then raise exception 'invalid_opportunity_title'; end if;
  if char_length(v_category)<2 or char_length(v_category)>120 then raise exception 'invalid_opportunity_category'; end if;
  if char_length(v_city)<2 or char_length(v_city)>120 then raise exception 'invalid_opportunity_city'; end if;
  if coalesce(p_vacancies,0)<1 or p_vacancies>1000 then raise exception 'invalid_vacancies'; end if;
  if p_daily_rate is not null and p_daily_rate<0 then raise exception 'invalid_daily_rate'; end if;
  if p_service_date is not null and p_service_date<current_date then raise exception 'invalid_service_date'; end if;
  select id into v_company_id from public.it_companies where user_id=v_uid order by created_at asc limit 1;
  if v_company_id is null then raise exception 'company_not_found'; end if;
  insert into public.it_opportunities(company_id,title,category,description,city,service_date,start_time,end_time,daily_rate,vacancies,status)
  values(v_company_id,v_title,v_category,nullif(btrim(coalesce(p_description,'')),''),v_city,p_service_date,p_start_time,p_end_time,p_daily_rate,p_vacancies,'draft') returning id into v_id;
  return v_id;
end;
$function$;

create or replace function public.it_update_my_opportunity(p_id uuid, p_title text, p_category text, p_description text, p_city text, p_service_date date, p_start_time time without time zone, p_end_time time without time zone, p_daily_rate numeric, p_vacancies integer)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare v_uid uuid:=auth.uid(); v_title text:=btrim(coalesce(p_title,'')); v_category text:=btrim(coalesce(p_category,'')); v_city text:=btrim(coalesce(p_city,''));
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if char_length(v_title)<2 or char_length(v_title)>160 then raise exception 'invalid_opportunity_title'; end if;
  if char_length(v_category)<2 or char_length(v_category)>120 then raise exception 'invalid_opportunity_category'; end if;
  if char_length(v_city)<2 or char_length(v_city)>120 then raise exception 'invalid_opportunity_city'; end if;
  if coalesce(p_vacancies,0)<1 or p_vacancies>1000 then raise exception 'invalid_vacancies'; end if;
  if p_daily_rate is not null and p_daily_rate<0 then raise exception 'invalid_daily_rate'; end if;
  if p_service_date is not null and p_service_date<current_date then raise exception 'invalid_service_date'; end if;
  update public.it_opportunities o
     set title=v_title,category=v_category,description=nullif(btrim(coalesce(p_description,'')),''),city=v_city,service_date=p_service_date,start_time=p_start_time,end_time=p_end_time,daily_rate=p_daily_rate,vacancies=p_vacancies
   where o.id=p_id and o.status='draft' and exists(select 1 from public.it_companies c where c.id=o.company_id and c.user_id=v_uid);
  if not found then raise exception 'opportunity_not_editable'; end if;
  return true;
end;
$function$;

create or replace function public.it_company_set_application_status(p_application_id uuid, p_status text)
returns boolean
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid:=auth.uid();
  v_current_status text;
  v_opportunity_id uuid;
  v_opportunity_status text;
  v_vacancies integer;
  v_active_services integer;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if p_status not in ('shortlisted','selected','declined') then raise exception 'invalid_application_status'; end if;
  select a.status,a.opportunity_id into v_current_status,v_opportunity_id
  from public.it_applications a where a.id=p_application_id for update;
  if not found or v_current_status in ('withdrawn','selected') then raise exception 'application_not_editable'; end if;
  select o.status,o.vacancies into v_opportunity_status,v_vacancies
  from public.it_opportunities o
  join public.it_companies c on c.id=o.company_id
  where o.id=v_opportunity_id and c.user_id=v_uid
  for update of o;
  if not found then raise exception 'application_not_editable'; end if;
  if p_status='selected' then
    if v_opportunity_status<>'published' then raise exception 'opportunity_not_open'; end if;
    select count(*) into v_active_services from public.it_services s where s.opportunity_id=v_opportunity_id and s.status<>'cancelled';
    if v_active_services>=v_vacancies then
      update public.it_opportunities set status='filled' where id=v_opportunity_id and status='published';
      raise exception 'opportunity_full';
    end if;
  end if;
  update public.it_applications set status=p_status where id=p_application_id;
  if p_status='selected' then
    select count(*) into v_active_services from public.it_services s where s.opportunity_id=v_opportunity_id and s.status<>'cancelled';
    if v_active_services>=v_vacancies then update public.it_opportunities set status='filled' where id=v_opportunity_id; end if;
  end if;
  return true;
end;
$function$;

create or replace function public.it_cancel_my_service_v2(p_service_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_uid uuid := auth.uid();
  v_is_pro boolean;
  v_is_company boolean;
  v_service public.it_services%rowtype;
  v_reason text := trim(coalesce(p_reason,''));
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if char_length(v_reason) < 3 then raise exception 'cancellation_reason_required'; end if;
  if char_length(v_reason) > 500 then raise exception 'cancellation_reason_too_long'; end if;
  select * into v_service from public.it_services where id=p_service_id for update;
  if v_service.id is null then raise exception 'service_not_found'; end if;
  select exists(select 1 from public.it_public_professionals p where p.id=v_service.professional_id and p.user_id=v_uid),
         exists(select 1 from public.it_companies c where c.id=v_service.company_id and c.user_id=v_uid)
    into v_is_pro,v_is_company;
  if not v_is_pro and not v_is_company then raise exception 'service_not_accessible'; end if;
  if v_service.status='cancelled' then return jsonb_build_object('ok',true,'status','cancelled','already_cancelled',true); end if;
  if v_service.status not in ('awaiting_confirmation','confirmed') then raise exception 'service_not_cancellable'; end if;
  if v_service.professional_completed_at is not null or v_service.company_completed_at is not null then raise exception 'service_completion_started'; end if;
  update public.it_services set status='cancelled',cancelled_at=now(),cancelled_by_user_id=v_uid,cancellation_reason=v_reason where id=p_service_id;
  update public.it_opportunities o
     set status='published'
   where o.id=v_service.opportunity_id
     and o.status='filled'
     and (o.service_date is null or o.service_date>=current_date)
     and (select count(*) from public.it_services s where s.opportunity_id=o.id and s.status<>'cancelled') < o.vacancies;
  return jsonb_build_object('ok',true,'status','cancelled');
end;
$function$;

create or replace function public.it_admin_opportunity_action(p_token text, p_opportunity_id uuid, p_action text)
returns boolean
language plpgsql
security definer
set search_path to 'public','extensions'
as $function$
declare v_admin uuid; v_company uuid; v_company_published boolean; v_title text; v_category text; v_city text; v_status text; v_vacancies integer; v_active integer;
begin
  v_admin:=public.it_admin_session_admin_id(p_token);
  if v_admin is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select company_id,title,category,city,status,vacancies into v_company,v_title,v_category,v_city,v_status,v_vacancies from public.it_opportunities where id=p_opportunity_id for update;
  if not found then raise exception 'opportunity_not_found'; end if;
  if p_action='publish' then
    select is_published into v_company_published from public.it_companies where id=v_company;
    if coalesce(v_company_published,false)=false then raise exception 'published_company_required'; end if;
    if char_length(trim(coalesce(v_title,'')))<2 or char_length(trim(coalesce(v_category,'')))<2 or char_length(trim(coalesce(v_city,'')))<2 then raise exception 'invalid_opportunity_payload'; end if;
    select count(*) into v_active from public.it_services where opportunity_id=p_opportunity_id and status<>'cancelled';
    if v_active>=coalesce(v_vacancies,0) then raise exception 'opportunity_full'; end if;
    update public.it_opportunities set status='published' where id=p_opportunity_id;
  elsif p_action='draft' then update public.it_opportunities set status='draft' where id=p_opportunity_id;
  elsif p_action='filled' then update public.it_opportunities set status='filled' where id=p_opportunity_id;
  elsif p_action='cancel' then update public.it_opportunities set status='cancelled' where id=p_opportunity_id;
  elsif p_action='complete' then update public.it_opportunities set status='completed' where id=p_opportunity_id;
  else raise exception 'invalid_action'; end if;
  perform public.it_admin_audit_write(v_admin,p_action,'opportunity',p_opportunity_id,jsonb_build_object('title',v_title,'previous_status',v_status));
  return true;
end;
$function$;
