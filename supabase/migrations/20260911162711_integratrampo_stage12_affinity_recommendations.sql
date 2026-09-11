-- IntegraTrampo · Etapa 12 · recomendações por afinidade
-- Ranking explicável, calculado ao vivo com os dados já existentes.

create or replace function public.it_my_recommendations_v1(p_limit integer default 8)
returns jsonb
language plpgsql
security invoker
set search_path = public, auth, pg_catalog
as $$
declare
  v_uid uuid := auth.uid();
  v_limit integer := greatest(1, least(coalesce(p_limit, 8), 20));
  v_prof public.it_public_professionals%rowtype;
  v_company public.it_companies%rowtype;
  v_jobs jsonb := '[]'::jsonb;
  v_professionals jsonb := '[]'::jsonb;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;

  select p.* into v_prof
  from public.it_public_professionals p
  left join public.it_professional_signups s on s.id = p.signup_id
  where coalesce(p.user_id, s.user_id) = v_uid
  order by p.is_published desc, p.created_at desc
  limit 1;

  select c.* into v_company
  from public.it_companies c
  where c.user_id = v_uid
  order by c.is_published desc, c.created_at desc
  limit 1;

  if v_prof.id is not null and v_prof.is_published then
    with raw as (
      select
        o.id,
        o.company_id,
        o.title,
        o.category,
        o.city,
        o.service_date,
        o.start_time,
        o.end_time,
        o.daily_rate,
        o.vacancies,
        o.image_url,
        c.display_name as company_name,
        c.logo_url as company_logo_url,
        c.rating as company_rating,
        c.review_count as company_review_count,
        exists(
          select 1 from public.it_favorites f
          where f.user_id = v_uid and f.entity_type = 'opportunity' and f.entity_id = o.id
        ) as is_favorite,
        (
          lower(coalesce(o.category,'')) = lower(coalesce(v_prof.role_title,''))
          or exists (
            select 1
            from unnest(coalesce(v_prof.work_categories, '{}'::text[])) wc
            where lower(wc) = lower(coalesce(o.category,''))
          )
        ) as category_match,
        lower(coalesce(o.city,'')) = lower(coalesce(v_prof.city,'')) as city_match,
        (v_prof.reference_daily is not null and o.daily_rate is not null and o.daily_rate >= v_prof.reference_daily) as rate_match
      from public.it_opportunities o
      join public.it_companies c on c.id = o.company_id and c.is_published = true
      where o.status = 'published'
        and (o.service_date is null or o.service_date >= current_date)
        and (v_company.id is null or o.company_id <> v_company.id)
        and not exists (
          select 1 from public.it_applications a
          where a.opportunity_id = o.id and a.professional_id = v_prof.id
        )
        and (
          o.service_date is null
          or not exists (
            select 1
            from public.it_services svc
            left join public.it_opportunities so on so.id = svc.opportunity_id
            left join public.it_direct_offers sd on sd.service_id = svc.id
            where svc.professional_id = v_prof.id
              and svc.status not in ('cancelled','completed')
              and coalesce(so.service_date, sd.service_date) is not null
              and (
                (
                  coalesce(so.service_date, sd.service_date)::timestamp
                  + coalesce(so.start_time, sd.start_time, time '00:00')
                )
                <
                case
                  when o.start_time is null or o.end_time is null then (o.service_date + 1)::timestamp
                  when o.end_time > o.start_time then o.service_date::timestamp + o.end_time
                  else (o.service_date + 1)::timestamp + o.end_time
                end
              )
              and (
                case
                  when coalesce(so.start_time, sd.start_time) is null or coalesce(so.end_time, sd.end_time) is null
                    then (coalesce(so.service_date, sd.service_date) + 1)::timestamp
                  when coalesce(so.end_time, sd.end_time) > coalesce(so.start_time, sd.start_time)
                    then coalesce(so.service_date, sd.service_date)::timestamp + coalesce(so.end_time, sd.end_time)
                  else (coalesce(so.service_date, sd.service_date) + 1)::timestamp + coalesce(so.end_time, sd.end_time)
                end
                > o.service_date::timestamp + coalesce(o.start_time, time '00:00')
              )
          )
        )
    ), scored as (
      select r.*,
        least(100,
          (case when category_match then 40 else 0 end)
          + (case when city_match then 15 else 0 end)
          + (case when rate_match then 10 else 0 end)
          + (case when is_favorite then 10 else 0 end)
          + (case when coalesce(company_review_count,0) > 0 then round(coalesce(company_rating,0) / 5.0 * 10)::int else 0 end)
          + (case when coalesce(company_review_count,0) >= 3 then 5 else 0 end)
          + (case when service_date between current_date and current_date + 7 then 5 else 0 end)
          + (case when v_prof.availability_status in ('available_today','available_week') then 5 else 0 end)
        )::int as affinity_score,
        array_remove(array[
          case when category_match then 'Categoria compatível com seu perfil' end,
          case when city_match then 'Na sua cidade' end,
          case when rate_match then 'Valor igual ou acima da sua referência' end,
          case when is_favorite then 'Você salvou esta vaga' end,
          case when coalesce(company_review_count,0) > 0 and coalesce(company_rating,0) >= 4 then 'Contratante bem avaliado' end,
          case when service_date between current_date and current_date + 7 then 'Oportunidade próxima' end
        ]::text[], null) as reasons
      from raw r
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'entity_type','opportunity',
      'id',id,
      'company_id',company_id,
      'company_name',company_name,
      'company_logo_url',company_logo_url,
      'title',title,
      'category',category,
      'city',city,
      'service_date',service_date,
      'start_time',start_time,
      'end_time',end_time,
      'daily_rate',daily_rate,
      'vacancies',vacancies,
      'image_url',image_url,
      'company_rating',company_rating,
      'company_review_count',company_review_count,
      'affinity_score',affinity_score,
      'reasons',to_jsonb(reasons),
      'is_favorite',is_favorite
    ) order by affinity_score desc, is_favorite desc, service_date nulls last, id), '[]'::jsonb)
    into v_jobs
    from (select * from scored order by affinity_score desc, is_favorite desc, service_date nulls last, id limit v_limit) q;
  end if;

  if v_company.id is not null and v_company.is_published then
    with needs as (
      select category, city, daily_rate, created_at
      from public.it_opportunities
      where company_id = v_company.id and status in ('draft','published','filled')
      union all
      select category, city, daily_rate, created_at
      from public.it_direct_offers
      where company_id = v_company.id and status in ('pending','accepted')
    ), need_summary as (
      select
        coalesce(array_agg(distinct lower(category)) filter (where nullif(btrim(category),'') is not null), '{}'::text[]) as categories,
        coalesce(array_agg(distinct lower(city)) filter (where nullif(btrim(city),'') is not null), '{}'::text[]) as cities,
        avg(daily_rate) filter (where daily_rate is not null and daily_rate > 0) as avg_rate
      from needs
    ), raw as (
      select
        p.id,
        p.display_name,
        p.role_title,
        p.city,
        p.bio,
        p.reference_daily,
        p.has_transport,
        p.availability,
        p.availability_status,
        p.rating,
        p.review_count,
        p.trust_level,
        p.photo_url,
        p.work_categories,
        exists(
          select 1 from public.it_favorites f
          where f.user_id = v_uid and f.entity_type = 'professional' and f.entity_id = p.id
        ) as is_favorite,
        (
          cardinality(ns.categories) > 0 and (
            lower(coalesce(p.role_title,'')) = any(ns.categories)
            or exists (
              select 1 from unnest(coalesce(p.work_categories, '{}'::text[])) wc
              where lower(wc) = any(ns.categories)
            )
          )
        ) as category_match,
        (
          lower(coalesce(p.city,'')) = lower(coalesce(v_company.city,''))
          or lower(coalesce(p.city,'')) = any(ns.cities)
        ) as city_match,
        (ns.avg_rate is not null and p.reference_daily is not null and ns.avg_rate >= p.reference_daily) as budget_match
      from public.it_public_professionals p
      left join public.it_professional_signups ps on ps.id = p.signup_id
      cross join need_summary ns
      where p.is_published = true
        and coalesce(p.user_id, ps.user_id) is not null
        and coalesce(p.user_id, ps.user_id) <> v_uid
        and coalesce(p.availability_status,'available_week') <> 'unavailable'
    ), scored as (
      select r.*,
        least(100,
          (case when category_match then 35 else 0 end)
          + (case when city_match then 20 else 0 end)
          + (case when availability_status = 'available_today' then 15 when availability_status = 'available_week' then 10 else 0 end)
          + (case when coalesce(review_count,0) > 0 then round(coalesce(rating,0) / 5.0 * 10)::int else 0 end)
          + (case when coalesce(review_count,0) >= 3 then 5 else 0 end)
          + (case when is_favorite then 10 else 0 end)
          + (case when budget_match then 5 else 0 end)
        )::int as affinity_score,
        array_remove(array[
          case when category_match then 'Área compatível com suas contratações' end,
          case when city_match then 'Na sua região de contratação' end,
          case when availability_status = 'available_today' then 'Disponível hoje' when availability_status = 'available_week' then 'Disponível nesta semana' end,
          case when is_favorite then 'Você salvou este profissional' end,
          case when coalesce(review_count,0) > 0 and coalesce(rating,0) >= 4 then 'Profissional bem avaliado' end,
          case when budget_match then 'Referência de diária dentro do seu padrão recente' end
        ]::text[], null) as reasons
      from raw r
    )
    select coalesce(jsonb_agg(jsonb_build_object(
      'entity_type','professional',
      'id',id,
      'display_name',display_name,
      'role_title',role_title,
      'city',city,
      'bio',bio,
      'reference_daily',reference_daily,
      'has_transport',has_transport,
      'availability',availability,
      'availability_status',availability_status,
      'rating',rating,
      'review_count',review_count,
      'trust_level',trust_level,
      'photo_url',photo_url,
      'work_categories',to_jsonb(work_categories),
      'affinity_score',affinity_score,
      'reasons',to_jsonb(reasons),
      'is_favorite',is_favorite
    ) order by affinity_score desc, is_favorite desc, rating desc, review_count desc, id), '[]'::jsonb)
    into v_professionals
    from (select * from scored order by affinity_score desc, is_favorite desc, rating desc, review_count desc, id limit v_limit) q;
  end if;

  return jsonb_build_object(
    'algorithm_version','rules_v1',
    'generated_at',now(),
    'viewer',jsonb_build_object(
      'has_professional_profile',v_prof.id is not null and v_prof.is_published,
      'has_company_profile',v_company.id is not null and v_company.is_published
    ),
    'opportunities',v_jobs,
    'professionals',v_professionals
  );
end;
$$;

revoke all on function public.it_my_recommendations_v1(integer) from public;
revoke all on function public.it_my_recommendations_v1(integer) from anon;
grant execute on function public.it_my_recommendations_v1(integer) to authenticated;
