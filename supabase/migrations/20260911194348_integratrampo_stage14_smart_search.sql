-- IntegraTrampo · Etapa 14 · fundação da busca inteligente
-- Normalização sem acentos + índices FTS. A RPC pública final é definida na migration seguinte.

create or replace function public.it_search_norm_v1(p_text text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select translate(
    lower(coalesce(p_text,'')),
    'áàãâäéèêëíìîïóòõôöúùûüç',
    'aaaaaeeeeiiiiooooouuuuc'
  );
$$;

revoke all on function public.it_search_norm_v1(text) from public, anon, authenticated;
grant execute on function public.it_search_norm_v1(text) to anon, authenticated, service_role;

create index if not exists it_opportunities_search_fts_idx
on public.it_opportunities using gin (
  to_tsvector('simple', public.it_search_norm_v1(
    coalesce(title,'') || ' ' || coalesce(category,'') || ' ' || coalesce(description,'') || ' ' || coalesce(city,'')
  ))
);

create index if not exists it_public_professionals_search_fts_idx
on public.it_public_professionals using gin (
  to_tsvector('simple', public.it_search_norm_v1(
    coalesce(display_name,'') || ' ' || coalesce(role_title,'') || ' ' || coalesce(bio,'') || ' ' || coalesce(city,'')
  ))
);
