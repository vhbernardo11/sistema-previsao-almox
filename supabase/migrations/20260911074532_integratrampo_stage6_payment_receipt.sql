create table if not exists public.it_service_payments (
  service_id uuid primary key references public.it_services(id) on delete cascade,
  amount numeric(12,2) not null check (amount > 0 and amount <= 1000000),
  method text not null check (method in ('pix','cash','bank_transfer','other')),
  status text not null default 'reported' check (status in ('reported','confirmed','disputed')),
  company_user_id uuid not null references auth.users(id) on delete cascade,
  professional_user_id uuid not null references auth.users(id) on delete cascade,
  company_note text check (company_note is null or char_length(company_note) <= 500),
  professional_note text check (professional_note is null or char_length(professional_note) <= 500),
  reported_at timestamptz not null default now(),
  confirmed_at timestamptz,
  disputed_at timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists it_service_payments_company_user_idx on public.it_service_payments(company_user_id, updated_at desc);
create index if not exists it_service_payments_professional_user_idx on public.it_service_payments(professional_user_id, updated_at desc);
create index if not exists it_service_payments_status_idx on public.it_service_payments(status, updated_at desc);

alter table public.it_service_payments enable row level security;

drop policy if exists it_service_payments_participant_select on public.it_service_payments;
create policy it_service_payments_participant_select
on public.it_service_payments for select to authenticated
using (auth.uid() = company_user_id or auth.uid() = professional_user_id);

revoke all on table public.it_service_payments from anon;
revoke insert, update, delete on table public.it_service_payments from authenticated;
grant select on table public.it_service_payments to authenticated;

create or replace function public.it_report_service_payment_v1(
  p_service_id uuid,
  p_amount numeric,
  p_method text,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_service public.it_services%rowtype;
  v_company_user uuid;
  v_professional_user uuid;
  v_payment public.it_service_payments%rowtype;
  v_note text := nullif(trim(coalesce(p_note,'')), '');
  v_method text := lower(trim(coalesce(p_method,'')));
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_amount is null or p_amount <= 0 or p_amount > 1000000 then raise exception 'invalid_amount'; end if;
  if v_method not in ('pix','cash','bank_transfer','other') then raise exception 'invalid_payment_method'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note_too_long'; end if;

  select * into v_service from public.it_services where id=p_service_id;
  if v_service.id is null then raise exception 'service_not_found'; end if;
  if v_service.status <> 'completed' or v_service.completed_at is null then raise exception 'service_not_completed'; end if;

  select c.user_id, p.user_id
    into v_company_user, v_professional_user
  from public.it_services s
  join public.it_companies c on c.id=s.company_id
  join public.it_public_professionals p on p.id=s.professional_id
  where s.id=p_service_id;

  if v_company_user is null or v_professional_user is null then raise exception 'service_participants_missing'; end if;
  if v_uid <> v_company_user then raise exception 'company_only_action'; end if;

  select * into v_payment from public.it_service_payments where service_id=p_service_id;
  if found and v_payment.status='confirmed' then raise exception 'payment_already_confirmed'; end if;

  insert into public.it_service_payments(
    service_id, amount, method, status, company_user_id, professional_user_id,
    company_note, professional_note, reported_at, confirmed_at, disputed_at, updated_at
  ) values (
    p_service_id, round(p_amount,2), v_method, 'reported', v_company_user, v_professional_user,
    v_note, null, now(), null, null, now()
  )
  on conflict (service_id) do update set
    amount=excluded.amount,
    method=excluded.method,
    status='reported',
    company_note=excluded.company_note,
    professional_note=null,
    reported_at=now(),
    confirmed_at=null,
    disputed_at=null,
    updated_at=now();

  insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
  values (
    v_professional_user,
    'payment_reported',
    'Pagamento informado',
    'O contratante informou o pagamento deste serviço. Confira o valor e confirme o recebimento.',
    'service',
    p_service_id
  );

  return jsonb_build_object(
    'ok',true,
    'service_id',p_service_id,
    'status','reported',
    'amount',round(p_amount,2),
    'method',v_method
  );
end;
$$;

create or replace function public.it_confirm_service_payment_v1(
  p_service_id uuid,
  p_received boolean,
  p_note text default null
) returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_uid uuid := auth.uid();
  v_payment public.it_service_payments%rowtype;
  v_note text := nullif(trim(coalesce(p_note,'')), '');
  v_status text;
begin
  if v_uid is null then raise exception 'unauthorized' using errcode='42501'; end if;
  if p_received is null then raise exception 'invalid_confirmation'; end if;
  if v_note is not null and char_length(v_note) > 500 then raise exception 'note_too_long'; end if;

  select * into v_payment from public.it_service_payments where service_id=p_service_id;
  if v_payment.service_id is null then raise exception 'payment_not_reported'; end if;
  if v_uid <> v_payment.professional_user_id then raise exception 'professional_only_action'; end if;

  if v_payment.status='confirmed' then
    if p_received then
      return jsonb_build_object('ok',true,'service_id',p_service_id,'status','confirmed','already_done',true);
    end if;
    raise exception 'payment_already_confirmed';
  end if;

  if v_payment.status='disputed' then
    if not p_received then
      return jsonb_build_object('ok',true,'service_id',p_service_id,'status','disputed','already_done',true);
    end if;
    raise exception 'payment_needs_company_rereport';
  end if;

  if p_received then
    update public.it_service_payments set
      status='confirmed',
      professional_note=v_note,
      confirmed_at=now(),
      disputed_at=null,
      updated_at=now()
    where service_id=p_service_id;
    v_status:='confirmed';

    insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
    values (
      v_payment.company_user_id,
      'payment_confirmed',
      'Pagamento confirmado',
      'O profissional confirmou o recebimento do pagamento deste serviço.',
      'service',
      p_service_id
    );
  else
    if v_note is null or char_length(v_note) < 3 then raise exception 'dispute_note_required'; end if;
    update public.it_service_payments set
      status='disputed',
      professional_note=v_note,
      disputed_at=now(),
      confirmed_at=null,
      updated_at=now()
    where service_id=p_service_id;
    v_status:='disputed';

    insert into public.it_notifications(user_id,type,title,body,entity_type,entity_id)
    values (
      v_payment.company_user_id,
      'payment_disputed',
      'Divergência no pagamento',
      'O profissional informou uma divergência no pagamento. Revise os dados e registre novamente.',
      'service',
      p_service_id
    );
  end if;

  return jsonb_build_object('ok',true,'service_id',p_service_id,'status',v_status);
end;
$$;

create or replace function public.it_my_service_payments_v1()
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

  select coalesce(jsonb_agg(to_jsonb(x) order by x.updated_at desc),'[]'::jsonb)
  into v_result
  from (
    select
      pay.service_id,
      pay.amount,
      pay.method,
      pay.status,
      pay.company_note,
      pay.professional_note,
      pay.reported_at,
      pay.confirmed_at,
      pay.disputed_at,
      pay.updated_at,
      case when pay.professional_user_id=v_uid then 'professional' else 'company' end as viewer_side,
      o.title as job_title,
      o.category,
      o.service_date,
      c.display_name as company_name,
      p.display_name as professional_name
    from public.it_service_payments pay
    join public.it_services s on s.id=pay.service_id
    left join public.it_opportunities o on o.id=s.opportunity_id
    left join public.it_companies c on c.id=s.company_id
    left join public.it_public_professionals p on p.id=s.professional_id
    where pay.company_user_id=v_uid or pay.professional_user_id=v_uid
  ) x;

  return v_result;
end;
$$;

revoke all on function public.it_report_service_payment_v1(uuid,numeric,text,text) from public, anon;
revoke all on function public.it_confirm_service_payment_v1(uuid,boolean,text) from public, anon;
revoke all on function public.it_my_service_payments_v1() from public, anon;
grant execute on function public.it_report_service_payment_v1(uuid,numeric,text,text) to authenticated;
grant execute on function public.it_confirm_service_payment_v1(uuid,boolean,text) to authenticated;
grant execute on function public.it_my_service_payments_v1() to authenticated;
