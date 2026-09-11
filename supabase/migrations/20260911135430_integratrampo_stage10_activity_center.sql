-- IntegraTrampo · Etapa 10 · Central de Atividades
-- Pendências são calculadas a partir do estado real do fluxo; notificações permanecem como histórico.

create or replace function public.it_my_activity_center_v1(p_limit integer default 60)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
with
me as (
  select auth.uid() as uid,
         greatest(1, least(coalesce(p_limit,60),100))::integer as lim
),
my_pro as (
  select p.id,p.user_id,p.display_name
  from public.it_public_professionals p, me
  where p.user_id=me.uid
  order by p.created_at desc
  limit 1
),
my_company as (
  select c.id,c.user_id,c.display_name
  from public.it_companies c, me
  where c.user_id=me.uid
  order by c.created_at desc
  limit 1
),
service_base as (
  select s.id as service_id,s.status,s.created_at,s.professional_confirmed_at,s.company_confirmed_at,
         s.professional_completed_at,s.company_completed_at,s.completed_at,
         case when mp.id is not null and s.professional_id=mp.id then 'professional' else 'company' end as viewer_side,
         coalesce(o.title,d.title,'Serviço') as job_title,
         coalesce(o.service_date,d.service_date) as service_date,
         coalesce(c.display_name,'Contratante') as company_name,
         coalesce(p.display_name,'Profissional') as professional_name
  from public.it_services s
  left join my_pro mp on mp.id=s.professional_id
  left join my_company mc on mc.id=s.company_id
  left join public.it_opportunities o on o.id=s.opportunity_id
  left join public.it_direct_offers d on d.service_id=s.id
  left join public.it_companies c on c.id=s.company_id
  left join public.it_public_professionals p on p.id=s.professional_id
  where mp.id is not null or mc.id is not null
),
actions as (
  select
    ('chat:'||t.id::text)::text as action_key,
    'high'::text as priority,
    15::integer as sort_rank,
    '💬'::text as icon,
    ('Mensagem de '||case when c.user_id=me.uid then coalesce(p.display_name,'Profissional') else coalesce(c.display_name,'Contratante') end)::text as title,
    (um.unread_count::text||case when um.unread_count=1 then ' mensagem não lida' else ' mensagens não lidas' end||' · '||coalesce(o.title,d.title,'Contratação'))::text as body,
    'chat'::text as action_type,
    'chat_thread'::text as entity_type,
    t.id::uuid as entity_id,
    (case when c.user_id=me.uid then 'company' else 'professional' end)::text as viewer_side,
    um.unread_count::integer as count_value,
    um.last_at::timestamptz as created_at
  from public.it_chat_threads t
  join public.it_companies c on c.id=t.company_id
  join public.it_public_professionals p on p.id=t.professional_id
  cross join me
  left join public.it_services s on s.id=t.service_id
  left join public.it_opportunities o on o.id=s.opportunity_id
  left join public.it_direct_offers d on d.id=t.direct_offer_id
  join lateral (
    select count(*)::integer as unread_count,max(m.created_at) as last_at
    from public.it_chat_messages m
    where m.thread_id=t.id and m.sender_user_id<>me.uid and m.read_at is null
  ) um on um.unread_count>0
  where c.user_id=me.uid or p.user_id=me.uid

  union all

  select ('direct_offer:'||d.id::text)::text,
    (case when d.service_date<=current_date+1 then 'urgent' else 'high' end)::text,
    (case when d.service_date<=current_date+1 then 5 else 20 end)::integer,
    '🎯'::text,'Responder proposta direta'::text,
    (coalesce(c.display_name,'Contratante')||' convidou você para '||d.title||' · '||to_char(d.service_date,'DD/MM'))::text,
    'direct_offer'::text,'direct_offer'::text,d.id::uuid,'professional'::text,1::integer,d.created_at::timestamptz
  from public.it_direct_offers d
  join public.it_public_professionals p on p.id=d.professional_id
  join public.it_companies c on c.id=d.company_id
  cross join me
  where p.user_id=me.uid and d.status='pending'

  union all

  select ('confirm_service:'||sb.service_id::text)::text,
    (case when sb.service_date is not null and sb.service_date<=current_date+1 then 'urgent' else 'high' end)::text,
    (case when sb.service_date is not null and sb.service_date<=current_date+1 then 8 else 25 end)::integer,
    '🤝'::text,'Confirme seu serviço'::text,
    (sb.job_title||case when sb.service_date is not null then ' · '||to_char(sb.service_date,'DD/MM') else '' end)::text,
    'service_confirm'::text,'service'::text,sb.service_id::uuid,sb.viewer_side::text,1::integer,sb.created_at::timestamptz
  from service_base sb
  where sb.status='awaiting_confirmation'
    and ((sb.viewer_side='professional' and sb.professional_confirmed_at is null)
      or (sb.viewer_side='company' and sb.company_confirmed_at is null))

  union all

  select ('complete_service:'||sb.service_id::text)::text,'high'::text,30::integer,'✅'::text,
    'Informe a conclusão do serviço'::text,sb.job_title::text,'service_complete'::text,'service'::text,
    sb.service_id::uuid,sb.viewer_side::text,1::integer,sb.created_at::timestamptz
  from service_base sb
  where sb.status='confirmed'
    and (sb.service_date is null or sb.service_date<=current_date)
    and ((sb.viewer_side='professional' and sb.professional_completed_at is null)
      or (sb.viewer_side='company' and sb.company_completed_at is null))

  union all

  select ('payment_report:'||sb.service_id::text)::text,'normal'::text,45::integer,'💰'::text,
    'Registre o pagamento'::text,(sb.job_title||' · acerto feito fora da plataforma')::text,
    'payment_report'::text,'service'::text,sb.service_id::uuid,'company'::text,1::integer,
    coalesce(sb.completed_at,sb.created_at)::timestamptz
  from service_base sb
  left join public.it_service_payments pay on pay.service_id=sb.service_id
  where sb.status='completed' and sb.viewer_side='company' and pay.service_id is null

  union all

  select ('payment_correct:'||sb.service_id::text)::text,'urgent'::text,6::integer,'⚠️'::text,
    'Corrija o pagamento informado'::text,(sb.job_title||' · o profissional informou divergência')::text,
    'payment_correct'::text,'service'::text,sb.service_id::uuid,'company'::text,1::integer,pay.updated_at::timestamptz
  from service_base sb
  join public.it_service_payments pay on pay.service_id=sb.service_id
  where sb.status='completed' and sb.viewer_side='company' and pay.status='disputed'

  union all

  select ('payment_confirm:'||sb.service_id::text)::text,'high'::text,18::integer,'💰'::text,
    'Confirme o recebimento'::text,(sb.job_title||' · pagamento informado pelo contratante')::text,
    'payment_confirm'::text,'service'::text,sb.service_id::uuid,'professional'::text,1::integer,pay.updated_at::timestamptz
  from service_base sb
  join public.it_service_payments pay on pay.service_id=sb.service_id
  where sb.status='completed' and sb.viewer_side='professional' and pay.status='reported'

  union all

  select ('review:'||sb.service_id::text)::text,'info'::text,70::integer,'⭐'::text,
    'Avalie este serviço'::text,(sb.job_title||' · sua avaliação ajuda a reputação da comunidade')::text,
    'review'::text,'service'::text,sb.service_id::uuid,sb.viewer_side::text,1::integer,
    coalesce(sb.completed_at,sb.created_at)::timestamptz
  from service_base sb
  cross join me
  where sb.status='completed'
    and not exists (select 1 from public.it_reviews r where r.service_id=sb.service_id and r.reviewer_user_id=me.uid)

  union all

  select ('application:'||a.id::text)::text,'normal'::text,50::integer,'👤'::text,
    'Candidatura aguardando sua decisão'::text,
    (coalesce(p.display_name,'Profissional')||' · '||coalesce(o.title,'Oportunidade'))::text,
    'application_review'::text,'application'::text,a.id::uuid,'company'::text,1::integer,a.created_at::timestamptz
  from public.it_applications a
  join public.it_opportunities o on o.id=a.opportunity_id
  join public.it_companies c on c.id=o.company_id
  left join public.it_public_professionals p on p.id=a.professional_id
  cross join me
  where c.user_id=me.uid and a.status in ('interested','shortlisted')
),
ordered_actions as (
  select * from actions order by sort_rank asc,created_at desc
),
notes as (
  select n.id,n.created_at,n.type,n.title,n.body,n.entity_type,n.entity_id,n.read_at,
    case when n.type in ('incident','payment') then 'high'
         when n.type in ('chat_message','direct_offer','service') then 'normal'
         else 'info' end as priority,
    case when n.type='chat_message' then '💬'
         when n.type='direct_offer' then '🎯'
         when n.type='payment' then '💰'
         when n.type='application' then '👤'
         when n.type='incident' then '🛡️'
         when n.type='review' then '⭐'
         when n.type='opportunity' then '💼'
         else '🔔' end as icon,
    case when n.type='chat_message' then 'chat_context'
         when n.entity_type='direct_offer' then 'direct_offer'
         when n.entity_type='service' then 'service'
         when n.entity_type='application' then 'application_review'
         when n.entity_type='opportunity' then 'jobs'
         else 'none' end as action_type
  from public.it_notifications n,me
  where n.user_id=me.uid
  order by n.created_at desc
  limit (select lim from me)
),
summary as (
  select
    (select count(*)::integer from public.it_notifications n,me where n.user_id=me.uid and n.read_at is null) as unread_notifications,
    (select count(*)::integer from actions) as action_required,
    (select count(*)::integer from actions where priority='urgent') as urgent,
    coalesce((select sum(count_value)::integer from actions where action_type='chat'),0) as unread_messages
)
select jsonb_build_object(
  'summary',(select to_jsonb(summary) from summary),
  'actions',coalesce((select jsonb_agg(to_jsonb(a) order by a.sort_rank,a.created_at desc) from ordered_actions a),'[]'::jsonb),
  'notifications',coalesce((select jsonb_agg(to_jsonb(n) order by n.created_at desc) from notes n),'[]'::jsonb),
  'generated_at',now()
);
$$;

revoke all on function public.it_my_activity_center_v1(integer) from public;
revoke all on function public.it_my_activity_center_v1(integer) from anon;
grant execute on function public.it_my_activity_center_v1(integer) to authenticated;

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime' and schemaname='public' and tablename='it_notifications'
  ) then
    alter publication supabase_realtime add table public.it_notifications;
  end if;
end $$;
