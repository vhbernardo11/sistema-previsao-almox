// IntegraTrampo · Etapa 16 · social preview bridge para Vercel
// Entrega Open Graph server-side para robôs de compartilhamento e redireciona pessoas ao deep link do app.
const SUPABASE_URL='https://ghspaqawzfqtsxibgqxy.supabase.co';
const SUPABASE_KEY='sb_publishable_zzfaJaBr-schcxD7EMh3wA_69Vx1Xsg';
const UUID=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const CHANNELS=new Set(['whatsapp','facebook','x','linkedin','native','share']);

function esc(v){return String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]))}
function header(req,name){const v=req.headers?.[name]??req.headers?.[name.toLowerCase()];return Array.isArray(v)?v[0]:v}
function originOf(req){const host=header(req,'x-forwarded-host')||header(req,'host')||'integratrampo-live-v3.vercel.app';const proto=header(req,'x-forwarded-proto')||'https';return `${proto}://${host}`}
async function getJson(path){const r=await fetch(`${SUPABASE_URL}/rest/v1/${path}`,{headers:{apikey:SUPABASE_KEY,Accept:'application/json'}});if(!r.ok)return [];return r.json()}
function money(v){const n=Number(v);return Number.isFinite(n)&&n>0?`R$ ${n.toLocaleString('pt-BR',{maximumFractionDigits:2})}/dia`:'valor a combinar'}
function absoluteImage(src,origin){if(!src)return '';try{return new URL(src,origin).toString()}catch{return ''}}

module.exports=async function handler(req,res){
  const origin=originOf(req);
  const u=new URL(req.url||'/api/share',origin);
  const type=(u.searchParams.get('type')||'').toLowerCase();
  const id=u.searchParams.get('id')||'';
  const rawChannel=(u.searchParams.get('channel')||'share').toLowerCase();
  const channel=CHANNELS.has(rawChannel)?rawChannel:'share';
  if(!['job','pro'].includes(type)||!UUID.test(id)){
    res.statusCode=400;res.setHeader('Content-Type','text/html; charset=utf-8');
    return res.end('<!doctype html><html lang="pt-BR"><meta charset="utf-8"><title>Link inválido · IntegraTrampo</title><body>Link inválido.</body></html>');
  }

  let item=null,title='IntegraTrampo',description='Vagas e profissionais locais em Teodoro Sampaio - SP.',image='';
  try{
    if(type==='job'){
      const rows=await getJson(`it_opportunities?id=eq.${encodeURIComponent(id)}&status=eq.published&select=id,title,category,city,service_date,daily_rate,image_url,company_id&limit=1`);
      item=rows?.[0]||null;
      if(item){
        let company='Contratante aprovado';
        if(item.company_id){const companies=await getJson(`it_companies?id=eq.${encodeURIComponent(item.company_id)}&is_published=eq.true&select=display_name&limit=1`);company=companies?.[0]?.display_name||company}
        title=`${item.title||'Vaga'} | IntegraTrampo`;
        description=`${item.title||'Vaga'} · ${company} · ${item.city||'Teodoro Sampaio - SP'} · ${money(item.daily_rate)}. Veja os detalhes na IntegraTrampo.`;
        image=item.image_url||'';
      }
    }else{
      const rows=await getJson(`it_public_professionals?id=eq.${encodeURIComponent(id)}&is_published=eq.true&select=id,display_name,role_title,city,reference_daily,rating,review_count,photo_url&limit=1`);
      item=rows?.[0]||null;
      if(item){title=`${item.display_name||'Profissional'} | IntegraTrampo`;description=`${item.display_name||'Profissional'} · ${item.role_title||'Profissional'} · ${item.city||'Teodoro Sampaio - SP'} · ${money(item.reference_daily)}. Veja o perfil na IntegraTrampo.`;image=item.photo_url||''}
    }
  }catch(e){console.error('[stage16 share]',e)}

  const target=new URL('/',origin);
  target.searchParams.set(type==='job'?'vaga':'profissional',id);
  target.searchParams.set('utm_source',channel);
  target.searchParams.set('utm_medium','share');
  target.searchParams.set('utm_campaign','integratrampo_stage16');
  const targetUrl=target.toString();
  const img=absoluteImage(image,origin);
  const status=item?200:404;
  if(!item){title='Conteúdo indisponível | IntegraTrampo';description='Este conteúdo não está mais publicado. Veja outras oportunidades e profissionais na IntegraTrampo.'}

  res.statusCode=status;
  res.setHeader('Content-Type','text/html; charset=utf-8');
  res.setHeader('Cache-Control','public, s-maxage=60, stale-while-revalidate=300');
  res.end(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${esc(title)}</title><meta name="description" content="${esc(description)}"><meta name="robots" content="noindex,follow"><meta property="og:type" content="website"><meta property="og:locale" content="pt_BR"><meta property="og:site_name" content="IntegraTrampo"><meta property="og:title" content="${esc(title)}"><meta property="og:description" content="${esc(description)}"><meta property="og:url" content="${esc(targetUrl)}">${img?`<meta property="og:image" content="${esc(img)}">`:''}<meta name="twitter:card" content="${img?'summary_large_image':'summary'}"><meta name="twitter:title" content="${esc(title)}"><meta name="twitter:description" content="${esc(description)}">${img?`<meta name="twitter:image" content="${esc(img)}">`:''}<link rel="canonical" href="${esc(targetUrl)}">${item?`<meta http-equiv="refresh" content="0;url=${esc(targetUrl)}"><script>location.replace(${JSON.stringify(targetUrl)})</script>`:''}</head><body><main style="font-family:system-ui,sans-serif;max-width:560px;margin:12vh auto;padding:24px;text-align:center"><h1>${esc(title)}</h1><p>${esc(description)}</p>${item?`<p><a href="${esc(targetUrl)}">Abrir na IntegraTrampo</a></p>`:'<p><a href="/">Ver IntegraTrampo</a></p>'}</main></body></html>`);
};