# IntegraTrampo

Marketplace local para conectar profissionais, freelancers, empresas, eventos e pessoas que precisam contratar serviços.

## Status

Fase piloto online com stack gratuita:
- GitHub para o código;
- Vercel para hospedagem;
- Supabase para banco de dados e segurança;
- WhatsApp para confirmação manual no piloto.

## O que já funciona
- home responsiva;
- pré-cadastro profissional real no Supabase;
- pedido de contratação real no Supabase;
- métricas públicas agregadas;
- listagem de profissionais aprovados;
- listagem de contratantes aprovados;
- listagem de oportunidades publicadas;
- filtros;
- favoritos locais;
- PWA e cache offline básico.

## Regra de foto

A foto do profissional é obrigatória antes da ativação e publicação do perfil. A aprovação também exige confirmação do WhatsApp. Empresas precisam de logo ou foto de identificação antes de aparecer publicamente.

Nenhum perfil sem identificação visual aprovada pode ser publicado.

## Segurança

O navegador usa apenas a chave publicável do Supabase. Não há `service_role`, senha administrativa ou segredo privado no frontend. As tabelas públicas usam RLS e expõem apenas dados próprios para publicação.

## Projeto

IntegraTrampo — Quem precisa de trabalho encontra quem precisa de gente.
