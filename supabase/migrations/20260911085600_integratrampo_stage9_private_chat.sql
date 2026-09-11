create table if not exists public.it_chat_threads (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  service_id uuid unique references public.it_services(id) on delete cascade,
  direct_offer_id uuid unique references public.it_direct_offers(id) on delete cascade,
  company_id uuid not null references public.it_companies(id) on delete cascade,
  professional_id uuid not null references public.it_public_professionals(id) on delete cascade,
  constraint it_chat_threads_context_check check (service_id is not null or direct_offer_id is not null)
);

create table if not exists public.it_chat_messages (
  id uuid primary key default gen_random_uuid(),
  created_at timestamptz not null default now(),
  thread_id uuid not null references public.it_chat_threads(id) on delete cascade,
  sender_user_id uuid not null references auth.users(id) on delete cascade,
  body text not null,
  read_at timestamptz,
  constraint it_chat_messages_body_check check (char_length(btrim(body)) between 1 and 2000)
);

create index if not exists idx_it_chat_threads_company on public.it_chat_threads(company_id, updated_at desc);
create index if not exists idx_it_chat_threads_professional on public.it_chat_threads(professional_id, updated_at desc);
create index if not exists idx_it_chat_messages_thread_created on public.it_chat_messages(thread_id, created_at);
create index if not exists idx_it_chat_messages_unread on public.it_chat_messages(thread_id, read_at) where read_at is null;

alter table public.it_chat_threads enable row level security;
alter table public.it_chat_messages enable row level security;

revoke all on table public.it_chat_threads from anon;
revoke all on table public.it_chat_messages from anon;
revoke all on table public.it_chat_threads from authenticated;
revoke all on table public.it_chat_messages from authenticated;
grant select on table public.it_chat_threads to authenticated;
grant select, insert on table public.it_chat_messages to authenticated;

drop policy if exists it_chat_threads_participant_select on public.it_chat_threads;
create policy it_chat_threads_participant_select
on public.it_chat_threads
for select
to authenticated
using (
  exists (
    select 1 from public.it_companies c
    where c.id = it_chat_threads.company_id
      and c.user_id = (select auth.uid())
  )
  or exists (
    select 1 from public.it_public_professionals p
    where p.id = it_chat_threads.professional_id
      and p.user_id = (select auth.uid())
  )
);

drop policy if exists it_chat_messages_participant_select on public.it_chat_messages;
create policy it_chat_messages_participant_select
on public.it_chat_messages
for select
to authenticated
using (
  exists (
    select 1
    from public.it_chat_threads t
    join public.it_companies c on c.id=t.company_id
    join public.it_public_professionals p on p.id=t.professional_id
    where t.id = it_chat_messages.thread_id
      and (c.user_id = (select auth.uid()) or p.user_id = (select auth.uid()))
  )
);

drop policy if exists it_chat_messages_participant_insert on public.it_chat_messages;
create policy it_chat_messages_participant_insert
on public.it_chat_messages
for insert
to authenticated
with check (
  sender_user_id = (select auth.uid())
  and char_length(btrim(body)) between 1 and 2000
  and exists (
    select 1
    from public.it_chat_threads t
    join public.it_companies c on c.id=t.company_id
    join public.it_public_professionals p on p.id=t.professional_id
    where t.id = it_chat_messages.thread_id
      and (c.user_id = (select auth.uid()) or p.user_id = (select auth.uid()))
  )
);

create or replace function public.it_get_or_create_chat_thread_v1(p_context_type text, p_context_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_company_id uuid;
  v_professional_id uuid;
  v_company_user uuid;
  v_professional_user uuid;
  v_service_id uuid;
  v_direct_offer_id uuid;
  v_thread_id uuid;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_context_type not in ('service','direct_offer') then raise exception 'invalid_chat_context'; end if;

  if p_context_type='service' then
    v_service_id := p_context_id;
    select s.company_id,s.professional_id,d.id
      into v_company_id,v_professional_id,v_direct_offer_id
    from public.it_services s
    left join public.it_direct_offers d on d.service_id=s.id
    where s.id=p_context_id;
    if v_company_id is null or v_professional_id is null then raise exception 'chat_context_not_found'; end if;
  else
    v_direct_offer_id := p_context_id;
    select d.company_id,d.professional_id,d.service_id
      into v_company_id,v_professional_id,v_service_id
    from public.it_direct_offers d
    where d.id=p_context_id;
    if v_company_id is null or v_professional_id is null then raise exception 'chat_context_not_found'; end if;
  end if;

  select c.user_id into v_company_user from public.it_companies c where c.id=v_company_id;
  select p.user_id into v_professional_user from public.it_public_professionals p where p.id=v_professional_id;
  if v_uid is distinct from v_company_user and v_uid is distinct from v_professional_user then
    raise exception 'chat_not_accessible' using errcode='42501';
  end if;

  if v_service_id is not null then
    select t.id into v_thread_id
    from public.it_chat_threads t
    where t.service_id=v_service_id
       or (v_direct_offer_id is not null and t.direct_offer_id=v_direct_offer_id)
    order by (t.service_id is not null) desc
    limit 1
    for update;
  elsif v_direct_offer_id is not null then
    select t.id into v_thread_id
    from public.it_chat_threads t
    where t.direct_offer_id=v_direct_offer_id
    limit 1
    for update;
  end if;

  if v_thread_id is null then
    insert into public.it_chat_threads(service_id,direct_offer_id,company_id,professional_id)
    values(v_service_id,v_direct_offer_id,v_company_id,v_professional_id)
    returning id into v_thread_id;
  else
    update public.it_chat_threads
       set service_id=coalesce(service_id,v_service_id),
           direct_offer_id=coalesce(direct_offer_id,v_direct_offer_id),
           updated_at=greatest(updated_at,now())
     where id=v_thread_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'thread_id',v_thread_id,
    'service_id',v_service_id,
    'direct_offer_id',v_direct_offer_id,
    'viewer_side',case when v_uid=v_professional_user then 'professional' else 'company' end
  );
exception
  when unique_violation then
    select t.id into v_thread_id
    from public.it_chat_threads t
    where (v_service_id is not null and t.service_id=v_service_id)
       or (v_direct_offer_id is not null and t.direct_offer_id=v_direct_offer_id)
    order by (t.service_id is not null) desc
    limit 1;
    if v_thread_id is null then raise; end if;
    return jsonb_build_object('ok',true,'thread_id',v_thread_id,'service_id',v_service_id,'direct_offer_id',v_direct_offer_id);
end;
$$;

revoke all on function public.it_get_or_create_chat_thread_v1(text,uuid) from public,anon;
grant execute on function public.it_get_or_create_chat_thread_v1(text,uuid) to authenticated;

create or replace function public.it_my_chat_threads_v1()
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_result jsonb;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;

  select coalesce(jsonb_agg(to_jsonb(x) order by x.sort_at desc),'[]'::jsonb)
    into v_result
  from (
    select
      t.id as thread_id,
      t.service_id,
      t.direct_offer_id,
      case when p.user_id=v_uid then 'professional' else 'company' end as viewer_side,
      case when p.user_id=v_uid then c.display_name else p.display_name end as counterpart_name,
      coalesce(d.title,o.title,'Conversa do serviço') as title,
      coalesce(s.status,d.status,'active') as status,
      lm.body as last_message_body,
      lm.sender_user_id as last_sender_user_id,
      lm.created_at as last_message_at,
      coalesce(uc.unread_count,0)::int as unread_count,
      coalesce(lm.created_at,t.updated_at,t.created_at) as sort_at
    from public.it_chat_threads t
    join public.it_companies c on c.id=t.company_id
    join public.it_public_professionals p on p.id=t.professional_id
    left join public.it_services s on s.id=t.service_id
    left join public.it_direct_offers d on d.id=t.direct_offer_id
    left join public.it_opportunities o on o.id=s.opportunity_id
    left join lateral (
      select m.body,m.sender_user_id,m.created_at
      from public.it_chat_messages m
      where m.thread_id=t.id
      order by m.created_at desc
      limit 1
    ) lm on true
    left join lateral (
      select count(*) as unread_count
      from public.it_chat_messages m
      where m.thread_id=t.id
        and m.sender_user_id<>v_uid
        and m.read_at is null
    ) uc on true
    where c.user_id=v_uid or p.user_id=v_uid
    order by coalesce(lm.created_at,t.updated_at,t.created_at) desc
    limit 50
  ) x;
  return v_result;
end;
$$;

revoke all on function public.it_my_chat_threads_v1() from public,anon;
grant execute on function public.it_my_chat_threads_v1() to authenticated;

create or replace function public.it_mark_chat_read_v1(p_thread_id uuid)
returns integer
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_thread public.it_chat_threads%rowtype;
  v_company_user uuid;
  v_professional_user uuid;
  v_count integer:=0;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  select * into v_thread from public.it_chat_threads where id=p_thread_id;
  if v_thread.id is null then raise exception 'chat_not_found'; end if;
  select user_id into v_company_user from public.it_companies where id=v_thread.company_id;
  select user_id into v_professional_user from public.it_public_professionals where id=v_thread.professional_id;
  if v_uid is distinct from v_company_user and v_uid is distinct from v_professional_user then raise exception 'chat_not_accessible' using errcode='42501'; end if;

  update public.it_chat_messages
     set read_at=now()
   where thread_id=p_thread_id
     and sender_user_id<>v_uid
     and read_at is null;
  get diagnostics v_count=row_count;

  update public.it_notifications
     set read_at=coalesce(read_at,now())
   where user_id=v_uid
     and type='chat_message'
     and read_at is null
     and (
       (v_thread.service_id is not null and entity_type='service' and entity_id=v_thread.service_id)
       or (v_thread.direct_offer_id is not null and entity_type='direct_offer' and entity_id=v_thread.direct_offer_id)
     );
  return v_count;
end;
$$;

revoke all on function public.it_mark_chat_read_v1(uuid) from public,anon;
grant execute on function public.it_mark_chat_read_v1(uuid) to authenticated;

create or replace function public.it_chat_message_after_insert_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_thread public.it_chat_threads%rowtype;
  v_company_user uuid;
  v_professional_user uuid;
  v_recipient uuid;
  v_entity_type text;
  v_entity_id uuid;
  v_preview text;
begin
  select * into v_thread from public.it_chat_threads where id=new.thread_id;
  if v_thread.id is null then raise exception 'chat_not_found'; end if;
  select user_id into v_company_user from public.it_companies where id=v_thread.company_id;
  select user_id into v_professional_user from public.it_public_professionals where id=v_thread.professional_id;

  if new.sender_user_id=v_company_user then v_recipient:=v_professional_user;
  elsif new.sender_user_id=v_professional_user then v_recipient:=v_company_user;
  else raise exception 'invalid_chat_sender';
  end if;

  update public.it_chat_threads set updated_at=new.created_at where id=new.thread_id;
  v_entity_type:=case when v_thread.service_id is not null then 'service' else 'direct_offer' end;
  v_entity_id:=coalesce(v_thread.service_id,v_thread.direct_offer_id);
  v_preview:=left(regexp_replace(btrim(new.body), E'[\n\r\t]+',' ','g'),180);

  if v_recipient is not null then
    insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
    values(v_recipient,'chat_message','Nova mensagem',v_preview,v_entity_type,v_entity_id);
  end if;
  return new;
end;
$$;

revoke all on function public.it_chat_message_after_insert_v1() from public,anon,authenticated;

drop trigger if exists trg_it_chat_message_after_insert on public.it_chat_messages;
create trigger trg_it_chat_message_after_insert
after insert on public.it_chat_messages
for each row execute function public.it_chat_message_after_insert_v1();

create or replace function public.it_chat_link_offer_service_v1()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.service_id is not null and old.service_id is distinct from new.service_id then
    update public.it_chat_threads
       set service_id=coalesce(service_id,new.service_id),updated_at=now()
     where direct_offer_id=new.id;
  end if;
  return new;
end;
$$;

revoke all on function public.it_chat_link_offer_service_v1() from public,anon,authenticated;

drop trigger if exists trg_it_chat_link_offer_service on public.it_direct_offers;
create trigger trg_it_chat_link_offer_service
after update of service_id on public.it_direct_offers
for each row execute function public.it_chat_link_offer_service_v1();

do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname='supabase_realtime'
      and schemaname='public'
      and tablename='it_chat_messages'
  ) then
    execute 'alter publication supabase_realtime add table public.it_chat_messages';
  end if;
end;
$$;