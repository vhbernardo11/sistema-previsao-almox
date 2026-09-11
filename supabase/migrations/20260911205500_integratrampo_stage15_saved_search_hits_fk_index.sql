-- IntegraTrampo · Etapa 15 · índice para o FK composto do histórico de buscas salvas
create index if not exists it_saved_search_hits_search_owner_idx
on public.it_saved_search_hits(saved_search_id,user_id);
