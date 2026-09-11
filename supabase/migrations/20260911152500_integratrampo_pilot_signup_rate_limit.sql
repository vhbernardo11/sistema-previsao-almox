-- Public pilot signup abuse protection.
-- The Edge Function consumes three atomic budgets (global, client and identifier).

create table if not exists public.it_signup_rate_limits (
  bucket_type text not null,
  key_hash text not null,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0,
  updated_at timestamptz not null default now(),
  primary key (bucket_type,key_hash),
  constraint it_signup_rate_limits_bucket_check check (bucket_type in ('client','identifier','global')),
  constraint it_signup_rate_limits_attempts_check check (attempts >= 0 and attempts <= 1000000),
  constraint it_signup_rate_limits_key_hash_check check (char_length(key_hash) between 16 and 128)
);

alter table public.it_signup_rate_limits enable row level security;
revoke all on table public.it_signup_rate_limits from public, anon, authenticated;

create or replace function public.it_take_signup_rate_limit_v1(
  p_bucket_type text,
  p_key_hash text,
  p_limit integer,
  p_window_seconds integer
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.it_signup_rate_limits%rowtype;
  v_now timestamptz:=clock_timestamp();
  v_retry integer;
begin
  if p_bucket_type not in ('client','identifier','global') then raise exception 'invalid_bucket_type'; end if;
  if p_key_hash is null or char_length(p_key_hash) < 16 or char_length(p_key_hash) > 128 then raise exception 'invalid_key_hash'; end if;
  if p_limit < 1 or p_limit > 10000 then raise exception 'invalid_limit'; end if;
  if p_window_seconds < 60 or p_window_seconds > 86400 then raise exception 'invalid_window'; end if;

  insert into public.it_signup_rate_limits(bucket_type,key_hash,window_started_at,attempts,updated_at)
  values(p_bucket_type,p_key_hash,v_now,0,v_now)
  on conflict (bucket_type,key_hash) do nothing;

  select * into v_row
  from public.it_signup_rate_limits
  where bucket_type=p_bucket_type and key_hash=p_key_hash
  for update;

  if v_row.window_started_at + make_interval(secs=>p_window_seconds) <= v_now then
    update public.it_signup_rate_limits
       set window_started_at=v_now,attempts=1,updated_at=v_now
     where bucket_type=p_bucket_type and key_hash=p_key_hash;
    return jsonb_build_object('allowed',true,'remaining',greatest(p_limit-1,0),'retry_after_seconds',0);
  end if;

  if v_row.attempts >= p_limit then
    v_retry:=greatest(1,ceil(extract(epoch from ((v_row.window_started_at + make_interval(secs=>p_window_seconds))-v_now)))::integer);
    return jsonb_build_object('allowed',false,'remaining',0,'retry_after_seconds',v_retry);
  end if;

  update public.it_signup_rate_limits
     set attempts=attempts+1,updated_at=v_now
   where bucket_type=p_bucket_type and key_hash=p_key_hash;

  return jsonb_build_object('allowed',true,'remaining',greatest(p_limit-v_row.attempts-1,0),'retry_after_seconds',0);
end;
$$;

revoke all on function public.it_take_signup_rate_limit_v1(text,text,integer,integer) from public, anon, authenticated;
grant execute on function public.it_take_signup_rate_limit_v1(text,text,integer,integer) to service_role;

create index if not exists it_signup_rate_limits_updated_idx on public.it_signup_rate_limits(updated_at);
