-- IntegraTrampo · Etapa 14 · RPC pública de busca
-- SECURITY INVOKER: visitante lê somente tabelas já públicas por RLS; afinidade é acrescentada apenas com sessão autenticada.

create or replace function public.it_search_marketplace_v1(
  p_entity_type text default 'all', p_query text default null, p_category text default null, p_city text default null,
  p_min_rate numeric default null, p_max_rate numeric default null, p_min_rating numeric default null,
  p_availability_status text default null, p_service_date date default null, p_min_affinity integer default null,
  p_sort text default 'relevance', p_limit integer default 30
)
returns jsonb
language plpgsql
stable
security invoker
set search_path = ''
as $$
declare
  v_uid uuid := auth.uid();
  v_type text := lower(coalesce(nullif(btrim(p_entity_type),''),'all'));
  v_sort text := lower(coalesce(nullif(btrim(p_sort),''),'relevance'));
  v_limit integer := greatest(1, least(coalesce(p_limit,30), 60));
  v_query text := nullif(btrim(public.it_search_norm_v1(p_query)), '');
  v_category text := nullif(btrim(public.it_search_norm_v1(p_category)), '');
  v_city text := nullif(btrim(public.it_search_norm_v1(p_city)), '');
  v_availability text := nullif(lower(btrim(coalesce(p_availability_status,''))), '');
  v_min_affinity integer := case when p_min_affinity is null then null else greatest(0, least(p_min_affinity,100)) end;
  v_recs jsonb := null;
  v_jobs jsonb := '[]'::jsonb;
  v_pros jsonb := '[]'::jsonb;
  v_job_count integer := 0;
  v_pro_count integer := 0;
begin
  if v_type not in ('all','opportunity','professional') then raise exception 'invalid_entity_type'; end if;
  if v_sort not in ('relevance','affinity','rating','rate_asc','rate_desc','date_asc') then raise exception 'invalid_sort'; end if;
  if p_min_rate is not null and p_min_rate < 0 then raise exception 'invalid_min_rate'; end if;
  if p_max_rate is not null and p_max_rate < 0 then raise exception 'invalid_max_rate'; end if;
  if p_min_rate is not null and p_max_rate is not null and p_min_rate > p_max_rate then raise exception 'invalid_rate_range'; end if;
  if p_min_rating is not null and (p_min_rating < 0 or p_min_rating > 5) then raise exception 'invalid_min_rating'; end if;
  if v_availability is not null and v_availability not in ('available_today','available_week','unavailable','any') then raise exception 'invalid_availability_status'; end if;

  if v_uid is not null then
    begin
      v_recs := public.it_my_recommendations_v1(20);
    exception when others then
      v_recs := null;
    end;
  end if;

  if v_type in ('all','opportunity') then
    with rec as (
      select (x->>'id')::uuid as id,
             nullif(x->>'affinity_score','')::integer as affinity_score,
             coalesce((x->>'is_favorite')::boolean,false) as is_favorite,
             coalesce(x->'reasons','[]'::jsonb) as reasons
      from jsonb_array_elements(coalesce(v_recs->'opportunities','[]'::jsonb)) x
    ), base as (
      select o.id,o.company_id,o.title,o.category,o.description,o.city,o.service_date,o.start_time,o.end_time,o.daily_rate,o.vacancies,o.image_url,
             c.display_name as company_name,c.logo_url as company_logo_url,c.rating as company_rating,c.review_count as company_review_count,
             r.affinity_score,coalesce(r.reasons,'[]'::jsonb) as affinity_reasons,coalesce(r.is_favorite,false) as is_favorite,
             case when v_query is null then 0::real else ts_rank_cd(
               to_tsvector('simple', public.it_search_norm_v1(coalesce(o.title,'')||' '||coalesce(o.category,'')||' '||coalesce(o.description,'')||' '||coalesce(o.city,''))),
               websearch_to_tsquery('simple',v_query)
             ) end as text_rank
      from public.it_opportunities o
      join public.it_companies c on c.id=o.company_id and c.is_published=true
      left join rec r on r.id=o.id
      where o.status='published'
        and (o.service_date is null or o.service_date>=current_date)
        and (v_query is null or to_tsvector('simple', public.it_search_norm_v1(coalesce(o.title,'')||' '||coalesce(o.category,'')||' '||coalesce(o.description,'')||' '||coalesce(o.city,''))) @@ websearch_to_tsquery('simple',v_query))
        and (v_category is null or public.it_search_norm_v1(o.category)=v_category)
        and (v_city is null or public.it_search_norm_v1(o.city) like '%'||v_city||'%')
        and (p_min_rate is null or coalesce(o.daily_rate,0)>=p_min_rate)
        and (p_max_rate is null or coalesce(o.daily_rate,0)<=p_max_rate)
        and (p_min_rating is null or coalesce(c.rating,0)>=p_min_rating)
        and (p_service_date is null or o.service_date=p_service_date)
        and (v_min_affinity is null or v_uid is null or coalesce(r.affinity_score,-1)>=v_min_affinity)
    ), ordered as (
      select * from base order by
        case when v_sort='affinity' then affinity_score end desc nulls last,
        case when v_sort='rating' then company_rating end desc nulls last,
        case when v_sort='rate_asc' then daily_rate end asc nulls last,
        case when v_sort='rate_desc' then daily_rate end desc nulls last,
        case when v_sort='date_asc' then service_date end asc nulls last,
        case when v_sort='relevance' then text_rank end desc,
        case when v_sort='relevance' then affinity_score end desc nulls last,
        is_favorite desc,company_rating desc nulls last,service_date asc nulls last,id
    ), limited as (select * from ordered limit v_limit)
    select (select count(*)::int from base),
           coalesce(jsonb_agg(jsonb_build_object(
             'entity_type','opportunity','id',id,'company_id',company_id,'company_name',company_name,'company_logo_url',company_logo_url,
             'title',title,'category',category,'description',description,'city',city,'service_date',service_date,'start_time',start_time,'end_time',end_time,
             'daily_rate',daily_rate,'vacancies',vacancies,'image_url',image_url,'rating',company_rating,'review_count',company_review_count,
             'affinity_score',affinity_score,'affinity_reasons',affinity_reasons,'is_favorite',is_favorite,'search_rank',round(text_rank::numeric,4)
           )), '[]'::jsonb)
    into v_job_count,v_jobs from limited;
  end if;

  if v_type in ('all','professional') then
    with rec as (
      select (x->>'id')::uuid as id,
             nullif(x->>'affinity_score','')::integer as affinity_score,
             coalesce((x->>'is_favorite')::boolean,false) as is_favorite,
             coalesce(x->'reasons','[]'::jsonb) as reasons
      from jsonb_array_elements(coalesce(v_recs->'professionals','[]'::jsonb)) x
    ), base as (
      select p.id,p.display_name,p.role_title,p.city,p.bio,p.reference_daily,p.has_transport,p.availability,p.availability_status,
             p.rating,p.review_count,p.trust_level,p.photo_url,p.work_categories,
             r.affinity_score,coalesce(r.reasons,'[]'::jsonb) as affinity_reasons,coalesce(r.is_favorite,false) as is_favorite,
             case when v_query is null then 0::real else ts_rank_cd(
               to_tsvector('simple', public.it_search_norm_v1(coalesce(p.display_name,'')||' '||coalesce(p.role_title,'')||' '||coalesce(p.bio,'')||' '||coalesce(p.city,'')||' '||coalesce(array_to_string(p.work_categories,' '),''))),
               websearch_to_tsquery('simple',v_query)
             ) end as text_rank
      from public.it_public_professionals p
      left join rec r on r.id=p.id
      where p.is_published=true
        and (v_uid is null or p.user_id is null or p.user_id<>v_uid)
        and (v_query is null or to_tsvector('simple', public.it_search_norm_v1(coalesce(p.display_name,'')||' '||coalesce(p.role_title,'')||' '||coalesce(p.bio,'')||' '||coalesce(p.city,'')||' '||coalesce(array_to_string(p.work_categories,' '),''))) @@ websearch_to_tsquery('simple',v_query))
        and (v_category is null or public.it_search_norm_v1(p.role_title)=v_category or exists(
          select 1 from unnest(coalesce(p.work_categories,'{}'::text[])) wc where public.it_search_norm_v1(wc)=v_category
        ))
        and (v_city is null or public.it_search_norm_v1(p.city) like '%'||v_city||'%')
        and (p_min_rate is null or coalesce(p.reference_daily,0)>=p_min_rate)
        and (p_max_rate is null or coalesce(p.reference_daily,0)<=p_max_rate)
        and (p_min_rating is null or coalesce(p.rating,0)>=p_min_rating)
        and (v_availability is null or v_availability='any' or coalesce(p.availability_status,'available_week')=v_availability)
        and (v_min_affinity is null or v_uid is null or coalesce(r.affinity_score,-1)>=v_min_affinity)
    ), ordered as (
      select * from base order by
        case when v_sort='affinity' then affinity_score end desc nulls last,
        case when v_sort='rating' then rating end desc nulls last,
        case when v_sort='rate_asc' then reference_daily end asc nulls last,
        case when v_sort='rate_desc' then reference_daily end desc nulls last,
        case when v_sort='relevance' then text_rank end desc,
        case when v_sort='relevance' then affinity_score end desc nulls last,
        is_favorite desc,rating desc nulls last,review_count desc,id
    ), limited as (select * from ordered limit v_limit)
    select (select count(*)::int from base),
           coalesce(jsonb_agg(jsonb_build_object(
             'entity_type','professional','id',id,'display_name',display_name,'role_title',role_title,'city',city,'bio',bio,
             'reference_daily',reference_daily,'has_transport',has_transport,'availability',availability,'availability_status',availability_status,
             'rating',rating,'review_count',review_count,'trust_level',trust_level,'photo_url',photo_url,'work_categories',to_jsonb(work_categories),
             'affinity_score',affinity_score,'affinity_reasons',affinity_reasons,'is_favorite',is_favorite,'search_rank',round(text_rank::numeric,4)
           )), '[]'::jsonb)
    into v_pro_count,v_pros from limited;
  end if;

  return jsonb_build_object(
    'authenticated',v_uid is not null,
    'personalization_available',v_uid is not null and v_recs is not null,
    'entity_type',v_type,
    'sort',v_sort,
    'counts',jsonb_build_object('opportunities',v_job_count,'professionals',v_pro_count,'total',v_job_count+v_pro_count),
    'opportunities',v_jobs,
    'professionals',v_pros,
    'generated_at',now()
  );
end;
$$;

revoke all on function public.it_search_marketplace_v1(text,text,text,text,numeric,numeric,numeric,text,date,integer,text,integer) from public;
grant execute on function public.it_search_marketplace_v1(text,text,text,text,numeric,numeric,numeric,text,date,integer,text,integer) to anon, authenticated;
