alter function public.it_availability_days_text(jsonb) set search_path to pg_catalog;

revoke execute on function public.it_save_my_company_v2_user(text,text,text,text,text,text,text,text) from public, anon;
grant execute on function public.it_save_my_company_v2_user(text,text,text,text,text,text,text,text) to authenticated;

revoke execute on function public.it_submit_my_review_v1(uuid,integer,text) from public, anon;
grant execute on function public.it_submit_my_review_v1(uuid,integer,text) to authenticated;

revoke execute on function public.it_update_my_professional_profile_v2(text,text,text,text,text[],text,numeric,boolean,text,jsonb,text) from public, anon;
grant execute on function public.it_update_my_professional_profile_v2(text,text,text,text,text[],text,numeric,boolean,text,jsonb,text) to authenticated;

revoke execute on function public.it_update_my_professional_profile_v3(text,text,text,text,text,text[],text,numeric,boolean,text,jsonb,text) from public, anon;
grant execute on function public.it_update_my_professional_profile_v3(text,text,text,text,text,text[],text,numeric,boolean,text,jsonb,text) to authenticated;

revoke execute on function public.it_refresh_service_reputation_v1(uuid) from public, anon, authenticated;
revoke execute on function public.it_review_reputation_stage4_trigger() from public, anon, authenticated;

create index if not exists it_admin_audit_admin_id_idx on public.it_admin_audit(admin_id);
