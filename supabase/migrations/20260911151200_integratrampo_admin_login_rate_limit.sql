-- IntegraTrampo admin login hardening.
-- Five failed attempts inside a 15-minute window lock that admin account for 15 minutes.

alter table public.it_admin_credentials
  add column if not exists failed_login_attempts integer not null default 0,
  add column if not exists last_failed_login_at timestamptz,
  add column if not exists locked_until timestamptz;

alter table public.it_admin_credentials
  drop constraint if exists it_admin_credentials_failed_login_attempts_check;
alter table public.it_admin_credentials
  add constraint it_admin_credentials_failed_login_attempts_check
  check (failed_login_attempts >= 0 and failed_login_attempts <= 1000000);

create or replace function public.it_admin_login(p_login text, p_password text)
returns table(token text, expires_at timestamp with time zone, display_name text)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_admin public.it_admin_credentials%rowtype;
  v_token text;
  v_expires timestamptz;
  v_base_attempts integer;
  v_new_attempts integer;
begin
  select * into v_admin
  from public.it_admin_credentials
  where lower(login)=lower(btrim(coalesce(p_login,''))) and active=true
  limit 1
  for update;

  if v_admin.id is null then return; end if;
  if v_admin.locked_until is not null and v_admin.locked_until > now() then return; end if;

  v_base_attempts := case
    when v_admin.last_failed_login_at is null or v_admin.last_failed_login_at < now() - interval '15 minutes' then 0
    else coalesce(v_admin.failed_login_attempts,0)
  end;

  if v_admin.password_hash is distinct from extensions.crypt(coalesce(p_password,''), v_admin.password_hash) then
    v_new_attempts := v_base_attempts + 1;
    update public.it_admin_credentials
       set failed_login_attempts=v_new_attempts,
           last_failed_login_at=now(),
           locked_until=case when v_new_attempts>=5 then now()+interval '15 minutes' else null end,
           updated_at=now()
     where id=v_admin.id;
    return;
  end if;

  v_token := encode(extensions.gen_random_bytes(32),'hex');
  v_expires := now() + interval '8 hours';

  insert into public.it_admin_sessions(admin_id,token_hash,expires_at)
  values(v_admin.id,encode(extensions.digest(v_token,'sha256'),'hex'),v_expires);

  update public.it_admin_credentials
     set last_login_at=now(),
         failed_login_attempts=0,
         last_failed_login_at=null,
         locked_until=null,
         updated_at=now()
   where id=v_admin.id;

  return query select v_token,v_expires,v_admin.display_name;
end;
$$;

revoke all on function public.it_admin_login(text,text) from public;
grant execute on function public.it_admin_login(text,text) to anon, authenticated;
