create or replace function public.it_professional_has_service_conflict_v1(
  p_professional_id uuid,
  p_service_date date,
  p_start_time time default null,
  p_end_time time default null,
  p_exclude_service_id uuid default null
) returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists(
    select 1
    from public.it_services s
    left join public.it_opportunities o on o.id=s.opportunity_id
    left join public.it_direct_offers d on d.service_id=s.id
    where s.professional_id=p_professional_id
      and s.status in ('awaiting_confirmation','confirmed')
      and (p_exclude_service_id is null or s.id<>p_exclude_service_id)
      and coalesce(o.service_date,d.service_date)=p_service_date
      and (
        p_start_time is null or p_end_time is null
        or coalesce(o.start_time,d.start_time) is null
        or coalesce(o.end_time,d.end_time) is null
        or (p_start_time < coalesce(o.end_time,d.end_time) and p_end_time > coalesce(o.start_time,d.start_time))
      )
  );
$$;

revoke all on function public.it_professional_has_service_conflict_v1(uuid,date,time,time,uuid) from public,anon,authenticated;

create or replace function public.it_company_set_application_status(p_application_id uuid,p_status text)
returns boolean language plpgsql security definer set search_path to 'public' as $$
declare
  v_uid uuid:=auth.uid();v_current_status text;v_opportunity_id uuid;v_professional_id uuid;v_opportunity_status text;v_vacancies integer;v_active_services integer;v_service_date date;v_start_time time;v_end_time time;
begin
  if v_uid is null then raise exception 'unauthorized'; end if;
  if p_status not in ('shortlisted','selected','declined') then raise exception 'invalid_application_status'; end if;
  select a.status,a.opportunity_id,a.professional_id into v_current_status,v_opportunity_id,v_professional_id from public.it_applications a where a.id=p_application_id for update;
  if not found or v_current_status in ('withdrawn','selected') then raise exception 'application_not_editable'; end if;
  select o.status,o.vacancies,o.service_date,o.start_time,o.end_time into v_opportunity_status,v_vacancies,v_service_date,v_start_time,v_end_time
  from public.it_opportunities o join public.it_companies c on c.id=o.company_id where o.id=v_opportunity_id and c.user_id=v_uid for update of o;
  if not found then raise exception 'application_not_editable'; end if;
  if p_status='selected' then
    if v_opportunity_status<>'published' then raise exception 'opportunity_not_open'; end if;
    perform 1 from public.it_public_professionals where id=v_professional_id for update;
    if public.it_professional_has_service_conflict_v1(v_professional_id,v_service_date,v_start_time,v_end_time,null) then raise exception 'professional_schedule_conflict'; end if;
    select count(*) into v_active_services from public.it_services s where s.opportunity_id=v_opportunity_id and s.status<>'cancelled';
    if v_active_services>=v_vacancies then update public.it_opportunities set status='filled' where id=v_opportunity_id and status='published';raise exception 'opportunity_full';end if;
  end if;
  update public.it_applications set status=p_status where id=p_application_id;
  if p_status='selected' then
    select count(*) into v_active_services from public.it_services s where s.opportunity_id=v_opportunity_id and s.status<>'cancelled';
    if v_active_services>=v_vacancies then update public.it_opportunities set status='filled' where id=v_opportunity_id; end if;
  end if;
  return true;
end;$$;

create or replace function public.it_respond_direct_offer_v1(p_offer_id uuid,p_accept boolean)
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid:=auth.uid();v_offer public.it_direct_offers%rowtype;v_prof_user uuid;v_company_user uuid;v_service_id uuid;
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
    perform 1 from public.it_public_professionals where id=v_offer.professional_id for update;
    if public.it_professional_has_service_conflict_v1(v_offer.professional_id,v_offer.service_date,v_offer.start_time,v_offer.end_time,null) then raise exception 'professional_schedule_conflict'; end if;
    insert into public.it_services(company_id,professional_id,status) values(v_offer.company_id,v_offer.professional_id,'awaiting_confirmation') returning id into v_service_id;
    update public.it_direct_offers set status='accepted',responded_at=now(),updated_at=now(),service_id=v_service_id where id=p_offer_id;
    if v_company_user is not null then insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id) values(v_company_user,'direct_offer_accepted','Proposta aceita','O profissional aceitou sua proposta direta. O serviço agora está aguardando confirmação das duas partes.','service',v_service_id); end if;
    return jsonb_build_object('ok',true,'offer_id',p_offer_id,'status','accepted','service_id',v_service_id);
  else
    update public.it_direct_offers set status='declined',responded_at=now(),updated_at=now() where id=p_offer_id;
    if v_company_user is not null then insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id) values(v_company_user,'direct_offer_declined','Proposta recusada','O profissional não aceitou sua proposta direta.','direct_offer',p_offer_id); end if;
    return jsonb_build_object('ok',true,'offer_id',p_offer_id,'status','declined');
  end if;
end;$$;

create or replace function public.it_my_schedule_v1()
returns jsonb language plpgsql security definer set search_path to 'public' as $$
declare v_uid uuid:=auth.uid();v_result jsonb;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select coalesce(jsonb_agg(to_jsonb(x) order by x.service_date,x.start_time nulls first,x.created_at),'[]'::jsonb) into v_result
  from (
    select s.id as service_id,s.created_at,s.status,case when p.user_id=v_uid then 'professional' else 'company' end as viewer_side,
      coalesce(o.title,d.title) as job_title,coalesce(o.category,d.category) as category,coalesce(o.city,d.city) as city,coalesce(o.service_date,d.service_date) as service_date,coalesce(o.start_time,d.start_time) as start_time,coalesce(o.end_time,d.end_time) as end_time,coalesce(o.daily_rate,d.daily_rate) as daily_rate,
      case when d.id is not null then 'direct_offer' else 'opportunity' end as source_type,c.display_name as company_name,p.display_name as professional_name,s.professional_confirmed_at,s.company_confirmed_at
    from public.it_services s left join public.it_opportunities o on o.id=s.opportunity_id left join public.it_direct_offers d on d.service_id=s.id join public.it_companies c on c.id=s.company_id join public.it_public_professionals p on p.id=s.professional_id
    where (c.user_id=v_uid or p.user_id=v_uid) and s.status in ('awaiting_confirmation','confirmed') and coalesce(o.service_date,d.service_date)>=current_date
  ) x;
  return v_result;
end;$$;

revoke all on function public.it_my_schedule_v1() from public,anon;
grant execute on function public.it_my_schedule_v1() to authenticated;
