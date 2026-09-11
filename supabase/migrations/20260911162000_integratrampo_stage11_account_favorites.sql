-- IntegraTrampo · Etapa 11 · favoritos sincronizados na conta
-- Aproveita public.it_favorites já existente e troca a escrita direta por RPCs validados.

create or replace function public.it_set_my_favorite_v1(
  p_entity_type text,
  p_entity_id uuid,
  p_favorite boolean default true
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(btrim(coalesce(p_entity_type,'')));
  v_owner uuid;
begin
  if v_uid is null then
    raise exception 'authentication_required';
  end if;
  if p_entity_id is null or v_type not in ('professional','opportunity') then
    raise exception 'invalid_favorite_entity';
  end if;

  if coalesce(p_favorite,true) then
    if v_type='professional' then
      select p.user_id into v_owner
      from public.it_public_professionals p
      where p.id=p_entity_id and p.is_published=true;
      if not found then raise exception 'favorite_entity_not_available'; end if;
      if v_owner=v_uid then raise exception 'cannot_favorite_yourself'; end if;
    else
      perform 1
      from public.it_opportunities o
      join public.it_companies c on c.id=o.company_id
      where o.id=p_entity_id
        and o.status='published'
        and c.is_published=true;
      if not found then raise exception 'favorite_entity_not_available'; end if;
    end if;

    insert into public.it_favorites(user_id,entity_type,entity_id)
    values(v_uid,v_type,p_entity_id)
    on conflict (user_id,entity_type,entity_id) do nothing;
  else
    delete from public.it_favorites f
    where f.user_id=v_uid and f.entity_type=v_type and f.entity_id=p_entity_id;
  end if;

  return jsonb_build_object(
    'ok',true,
    'entity_type',v_type,
    'entity_id',p_entity_id,
    'favorite',coalesce(p_favorite,true)
  );
end;
$$;

create or replace function public.it_my_favorites_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with me as (
    select auth.uid() as uid
  ),
  professionals as (
    select
      f.created_at as favorite_created_at,
      p.id,
      p.display_name,
      p.role_title,
      p.city,
      p.reference_daily,
      p.rating,
      p.review_count,
      p.trust_level,
      p.photo_url,
      p.has_transport,
      p.availability_status
    from public.it_favorites f
    join me on me.uid=f.user_id
    join public.it_public_professionals p on p.id=f.entity_id
    where f.entity_type='professional' and p.is_published=true
  ),
  opportunities as (
    select
      f.created_at as favorite_created_at,
      o.id,
      o.company_id,
      c.display_name as company_name,
      o.title,
      o.category,
      o.city,
      o.service_date,
      o.start_time,
      o.end_time,
      o.daily_rate,
      o.vacancies,
      o.image_url
    from public.it_favorites f
    join me on me.uid=f.user_id
    join public.it_opportunities o on o.id=f.entity_id
    join public.it_companies c on c.id=o.company_id
    where f.entity_type='opportunity'
      and o.status='published'
      and c.is_published=true
  )
  select case when (select uid from me) is null then
    jsonb_build_object('authenticated',false,'professionals','[]'::jsonb,'opportunities','[]'::jsonb,'counts',jsonb_build_object('professionals',0,'opportunities',0,'total',0))
  else
    jsonb_build_object(
      'authenticated',true,
      'professionals',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',p.id,
          'name',p.display_name,
          'role',p.role_title,
          'city',p.city,
          'rate',p.reference_daily,
          'rating',p.rating,
          'reviews',p.review_count,
          'trust_level',p.trust_level,
          'img',p.photo_url,
          'has_transport',p.has_transport,
          'availability_status',p.availability_status,
          'favorite_created_at',p.favorite_created_at
        ) order by p.favorite_created_at desc)
        from professionals p
      ),'[]'::jsonb),
      'opportunities',coalesce((
        select jsonb_agg(jsonb_build_object(
          'id',o.id,
          'company_id',o.company_id,
          'company',o.company_name,
          'title',o.title,
          'cat',o.category,
          'city',o.city,
          'service_date',o.service_date,
          'start_time',o.start_time,
          'end_time',o.end_time,
          'rate',o.daily_rate,
          'vacancies',o.vacancies,
          'img',o.image_url,
          'favorite_created_at',o.favorite_created_at
        ) order by o.favorite_created_at desc)
        from opportunities o
      ),'[]'::jsonb),
      'counts',jsonb_build_object(
        'professionals',(select count(*) from professionals),
        'opportunities',(select count(*) from opportunities),
        'total',(select count(*) from professionals)+(select count(*) from opportunities)
      )
    )
  end;
$$;

revoke all on function public.it_set_my_favorite_v1(text,uuid,boolean) from public;
revoke all on function public.it_set_my_favorite_v1(text,uuid,boolean) from anon;
grant execute on function public.it_set_my_favorite_v1(text,uuid,boolean) to authenticated;

revoke all on function public.it_my_favorites_v1() from public;
revoke all on function public.it_my_favorites_v1() from anon;
grant execute on function public.it_my_favorites_v1() to authenticated;

-- Usuários continuam podendo ler seus próprios favoritos via RLS, mas escrita passa pelos RPCs acima.
revoke insert, update, delete, truncate on table public.it_favorites from anon, authenticated;
grant select on table public.it_favorites to authenticated;