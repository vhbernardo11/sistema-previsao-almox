// IntegraTrampo · Etapa 14 · busca inteligente e filtros avançados
// Pesquisa real publicada: texto, categoria, cidade, diária, reputação, disponibilidade, data e afinidade.
(function(){
  if(window.IntegraTrampoStage14Search)return;

  let sb=null;
  let currentUser=null;
  let modalOpen=false;
  let busy=false;
  let result={authenticated:false,personalization_available:false,counts:{opportunities:0,professionals:0,total:0},opportunities:[],professionals:[]};
  let filters={entity_type:'all',query:'',category:'',city:'',min_rate:'',max_rate:'',min_rating:'',availability_status:'',service_date:'',min_affinity:'',sort:'relevance'};

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const money=v=>v===null||v===undefined||v===''?'A combinar':`R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtDate=v=>{if(!v)return 'A combinar';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(String(v).length===10?v+'T12:00:00':v))}catch{return String(v)}};
  const fmtTime=v=>v?String(v).slice(0,5):'';
  const fmtRange=(a,b)=>a&&b?`${fmtTime(a)}–${fmtTime(b)}${String(b)<String(a)?' (+1 dia)':''}`:'A combinar';

  function injectStyles(){
    if(document.getElementById('integratrampoStage14Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage14Styles';s.textContent=`
      .it-stage14-entry{white-space:nowrap}.it-stage14-modal{max-width:940px}.it-stage14-head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage14-badge{font-size:10px;font-weight:900;border-radius:999px;padding:5px 8px;background:#1976D2;color:#fff}.it-stage14-form{display:grid;grid-template-columns:2fr 1fr 1fr;gap:8px;margin:12px 0}.it-stage14-form label{display:grid;gap:4px;font-size:10px;font-weight:900;color:#586470}.it-stage14-form input,.it-stage14-form select{width:100%;min-width:0;padding:9px 10px;border:1px solid #d8e0e7;border-radius:10px;background:#fff;color:#0D1B2A;font:inherit;font-size:12px}.it-stage14-form .wide{grid-column:span 2}.it-stage14-actions{display:flex;gap:7px;flex-wrap:wrap;align-items:end}.it-stage14-actions .btn{min-height:38px}.it-stage14-summary{display:flex;gap:6px;flex-wrap:wrap;margin:10px 0}.it-stage14-chip{font-size:10px;font-weight:900;border-radius:999px;padding:5px 8px;background:#eef3f8;color:#40566d}.it-stage14-chip.is-blue{background:#e8f2ff;color:#155da7}.it-stage14-note{border-radius:12px;background:#f6f9fc;color:#586a7b;padding:9px 10px;font-size:11px;line-height:1.45}.it-stage14-scroll{max-height:52vh;overflow:auto;padding-right:2px}.it-stage14-group{margin-top:14px}.it-stage14-group__head{display:flex;justify-content:space-between;gap:8px;align-items:end;flex-wrap:wrap}.it-stage14-group__head h3{margin:0}.it-stage14-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:8px}.it-stage14-card{border:1px solid #e1e7ed;border-radius:15px;background:#fff;padding:11px;display:grid;gap:8px}.it-stage14-top{display:flex;justify-content:space-between;gap:10px}.it-stage14-identity{display:flex;gap:9px;min-width:0}.it-stage14-thumb{width:48px;height:48px;border-radius:13px;object-fit:cover;background:#eef3f6;display:grid;place-items:center;font-size:22px;flex:0 0 auto}.it-stage14-card h4{font-size:13px;margin:0 0 3px;color:#0D1B2A}.it-stage14-meta{font-size:11px;color:#697682;line-height:1.45}.it-stage14-score{font-size:10px;font-weight:900;border-radius:999px;padding:5px 7px;background:#eafaf4;color:#087858;height:max-content;white-space:nowrap}.it-stage14-reasons{display:flex;gap:4px;flex-wrap:wrap}.it-stage14-reason{font-size:9px;font-weight:800;background:#f2f5f8;color:#56626e;padding:4px 6px;border-radius:999px}.it-stage14-card__actions{display:flex;gap:6px;flex-wrap:wrap}.it-stage14-card__actions .btn{font-size:11px;padding:6px 8px;flex:1}.it-stage14-empty{border-radius:13px;background:#f7f9fb;color:#65717d;padding:12px;font-size:12px;margin-top:8px}.it-stage14-loading{padding:28px;text-align:center;color:#687481;font-size:12px}
      @media(max-width:760px){.it-stage14-form{grid-template-columns:1fr 1fr}.it-stage14-form .wide{grid-column:1/-1}.it-stage14-grid{grid-template-columns:1fr}}
      @media(max-width:520px){.it-stage14-form{grid-template-columns:1fr}.it-stage14-form .wide{grid-column:auto}.it-stage14-actions>*{flex:1}.it-stage14-top{align-items:flex-start}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function getUser(){if(!sb)await waitForSupabase();if(!sb)return null;try{const {data:{user}}=await sb.auth.getUser();currentUser=user||null;return currentUser}catch{currentUser=null;return null}}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}
  function nullableNumber(v){if(v===null||v===undefined||String(v).trim()==='')return null;const n=Number(v);return Number.isFinite(n)?n:null}

  function readForm(){
    const val=id=>document.getElementById(id)?.value??'';
    filters={entity_type:val('stage14Type')||'all',query:val('stage14Query'),category:val('stage14Category'),city:val('stage14City'),min_rate:val('stage14MinRate'),max_rate:val('stage14MaxRate'),min_rating:val('stage14Rating'),availability_status:val('stage14Availability'),service_date:val('stage14Date'),min_affinity:val('stage14Affinity'),sort:val('stage14Sort')||'relevance'};
    try{localStorage.setItem('it_stage14_filters_v1',JSON.stringify(filters))}catch{}
    return filters;
  }
  function loadSaved(){try{const x=JSON.parse(localStorage.getItem('it_stage14_filters_v1')||'null');if(x&&typeof x==='object')filters={...filters,...x}}catch{}}

  async function search(){
    const f=readForm();
    const min=nullableNumber(f.min_rate),max=nullableNumber(f.max_rate);
    if(min!==null&&max!==null&&min>max){tell('A diária mínima não pode ser maior que a máxima.');return false}
    busy=true;renderResults();
    try{
      result=await rpc('it_search_marketplace_v1',{p_entity_type:f.entity_type,p_query:f.query||null,p_category:f.category||null,p_city:f.city||null,p_min_rate:min,p_max_rate:max,p_min_rating:nullableNumber(f.min_rating),p_availability_status:f.availability_status||null,p_service_date:f.service_date||null,p_min_affinity:currentUser?nullableNumber(f.min_affinity):null,p_sort:f.sort,p_limit:30})||{};
      result.counts=result.counts||{opportunities:0,professionals:0,total:0};result.opportunities=Array.isArray(result.opportunities)?result.opportunities:[];result.professionals=Array.isArray(result.professionals)?result.professionals:[];
      return true;
    }catch(e){console.error('[Stage14 search]',e);tell('Não foi possível concluir a busca agora.');return false}
    finally{busy=false;renderResults()}
  }

  function reasonsHtml(x){const r=Array.isArray(x.affinity_reasons)?x.affinity_reasons:[];return r.length?`<div class="it-stage14-reasons">${r.slice(0,4).map(v=>`<span class="it-stage14-reason">${esc(v)}</span>`).join('')}</div>`:''}
  function scoreHtml(x){return x.affinity_score===null||x.affinity_score===undefined?'':`<span class="it-stage14-score">${Number(x.affinity_score)}/100 afinidade</span>`}

  function jobCard(o){
    const img=o.image_url?`<img class="it-stage14-thumb" src="${esc(o.image_url)}" alt="Imagem da vaga">`:`<div class="it-stage14-thumb">💼</div>`;
    return `<article class="it-stage14-card"><div class="it-stage14-top"><div class="it-stage14-identity">${img}<div><h4>${esc(o.title||'Vaga')}</h4><div class="it-stage14-meta">${esc(o.company_name||'Contratante')} · ${esc(o.category||'')}</div><div class="it-stage14-meta">📍 ${esc(o.city||'')} · 📅 ${esc(fmtDate(o.service_date))}</div><div class="it-stage14-meta">⏰ ${esc(fmtRange(o.start_time,o.end_time))} · <b>${esc(money(o.daily_rate))}</b>${Number(o.review_count||0)>0?` · ⭐ ${Number(o.rating||0).toFixed(1)}`:''}</div></div></div>${scoreHtml(o)}</div>${reasonsHtml(o)}<div class="it-stage14-card__actions"><button class="btn btn--green" onclick="stage14OpenEntity('opportunity','${esc(o.id)}')">Ver vaga</button><button class="btn btn--outline" onclick="stage14Save('opportunity','${esc(o.id)}',${o.is_favorite?'false':'true'})">${o.is_favorite?'★ Salva':'☆ Salvar'}</button></div></article>`;
  }
  function proCard(p){
    const img=p.photo_url?`<img class="it-stage14-thumb" src="${esc(p.photo_url)}" alt="Foto do profissional">`:`<div class="it-stage14-thumb">👤</div>`;
    const avail={available_today:'Disponível hoje',available_week:'Disponível nesta semana',unavailable:'Indisponível'}[p.availability_status]||p.availability||'Disponibilidade não informada';
    return `<article class="it-stage14-card"><div class="it-stage14-top"><div class="it-stage14-identity">${img}<div><h4>${esc(p.display_name||'Profissional')}</h4><div class="it-stage14-meta">${esc(p.role_title||'Profissional')} · 📍 ${esc(p.city||'')}</div><div class="it-stage14-meta">${esc(avail)} · <b>${esc(money(p.reference_daily))}</b>${Number(p.review_count||0)>0?` · ⭐ ${Number(p.rating||0).toFixed(1)}`:''}</div></div></div>${scoreHtml(p)}</div>${reasonsHtml(p)}<div class="it-stage14-card__actions"><button class="btn btn--outline" onclick="stage14OpenEntity('professional','${esc(p.id)}')">Ver perfil</button>${currentUser&&typeof window.openStage7DirectOffer==='function'?`<button class="btn btn--green" onclick="closeModal();openStage7DirectOffer('${esc(p.id)}')">Contratar</button>`:''}<button class="btn btn--outline" onclick="stage14Save('professional','${esc(p.id)}',${p.is_favorite?'false':'true'})">${p.is_favorite?'★ Salvo':'☆ Salvar'}</button></div></article>`;
  }

  function renderResults(){
    const root=document.getElementById('stage14Results');if(!root)return;
    if(busy){root.innerHTML='<div class="it-stage14-loading">🔎 Buscando na base publicada…</div>';return}
    const jobs=result.opportunities||[],pros=result.professionals||[],c=result.counts||{};
    let html=`<div class="it-stage14-summary"><span class="it-stage14-chip is-blue">${Number(c.total||0)} resultado(s)</span><span class="it-stage14-chip">💼 ${Number(c.opportunities||0)} vaga(s)</span><span class="it-stage14-chip">👤 ${Number(c.professionals||0)} profissional(is)</span>${result.authenticated?'<span class="it-stage14-chip">✨ afinidade ativa</span>':'<span class="it-stage14-chip">🔓 busca pública</span>'}</div>`;
    if((filters.entity_type==='all'||filters.entity_type==='opportunity'))html+=`<section class="it-stage14-group"><div class="it-stage14-group__head"><h3>💼 Vagas</h3><span class="small muted">${jobs.length} exibida(s)</span></div>${jobs.length?`<div class="it-stage14-grid">${jobs.map(jobCard).join('')}</div>`:'<div class="it-stage14-empty">Nenhuma vaga real publicada corresponde a esses filtros.</div>'}</section>`;
    if((filters.entity_type==='all'||filters.entity_type==='professional'))html+=`<section class="it-stage14-group"><div class="it-stage14-group__head"><h3>👤 Profissionais</h3><span class="small muted">${pros.length} exibido(s)</span></div>${pros.length?`<div class="it-stage14-grid">${pros.map(proCard).join('')}</div>`:'<div class="it-stage14-empty">Nenhum profissional real publicado corresponde a esses filtros.</div>'}</section>`;
    root.innerHTML=html;
  }

  function formHtml(){
    const f=filters;const auth=!!currentUser;
    return `<div class="it-stage14-head"><div><h2 style="margin:0">🔎 Busca inteligente</h2><div class="small muted">Combine filtros para encontrar vagas e profissionais reais publicados.</div></div><span class="it-stage14-badge">ETAPA 14</span></div><div class="it-stage14-note">A busca ignora acentos e entende várias palavras. Exemplos fictícios da vitrine não entram aqui. ${auth?'Sua conta também pode ordenar e filtrar por afinidade.':'Entre na conta para usar a pontuação de afinidade das Etapas 12–13.'}</div><div class="it-stage14-form"><label class="wide">O que você procura?<input id="stage14Query" value="${esc(f.query)}" placeholder="Ex.: garçom sábado, eletricista, limpeza"></label><label>Buscar em<select id="stage14Type"><option value="all" ${f.entity_type==='all'?'selected':''}>Vagas + profissionais</option><option value="opportunity" ${f.entity_type==='opportunity'?'selected':''}>Só vagas</option><option value="professional" ${f.entity_type==='professional'?'selected':''}>Só profissionais</option></select></label><label>Categoria / área<input id="stage14Category" value="${esc(f.category)}" placeholder="Ex.: Garçom"></label><label>Cidade<input id="stage14City" value="${esc(f.city)}" placeholder="Ex.: Teodoro Sampaio"></label><label>Diária mínima<input id="stage14MinRate" inputmode="decimal" type="number" min="0" step="10" value="${esc(f.min_rate)}" placeholder="R$"></label><label>Diária máxima<input id="stage14MaxRate" inputmode="decimal" type="number" min="0" step="10" value="${esc(f.max_rate)}" placeholder="R$"></label><label>Nota mínima<select id="stage14Rating"><option value="" ${!f.min_rating?'selected':''}>Qualquer</option><option value="3" ${String(f.min_rating)==='3'?'selected':''}>3,0+</option><option value="4" ${String(f.min_rating)==='4'?'selected':''}>4,0+</option><option value="4.5" ${String(f.min_rating)==='4.5'?'selected':''}>4,5+</option></select></label><label>Disponibilidade<select id="stage14Availability"><option value="" ${!f.availability_status?'selected':''}>Qualquer</option><option value="available_today" ${f.availability_status==='available_today'?'selected':''}>Disponível hoje</option><option value="available_week" ${f.availability_status==='available_week'?'selected':''}>Nesta semana</option></select></label><label>Data da vaga<input id="stage14Date" type="date" value="${esc(f.service_date)}"></label><label>Afinidade mínima<input id="stage14Affinity" type="number" min="0" max="100" step="5" value="${esc(f.min_affinity)}" placeholder="0–100" ${auth?'':'disabled'}></label><label>Ordenar<select id="stage14Sort"><option value="relevance" ${f.sort==='relevance'?'selected':''}>Mais relevantes</option><option value="affinity" ${f.sort==='affinity'?'selected':''} ${auth?'':'disabled'}>Maior afinidade</option><option value="rating" ${f.sort==='rating'?'selected':''}>Melhor nota</option><option value="rate_asc" ${f.sort==='rate_asc'?'selected':''}>Menor diária</option><option value="rate_desc" ${f.sort==='rate_desc'?'selected':''}>Maior diária</option><option value="date_asc" ${f.sort==='date_asc'?'selected':''}>Data mais próxima</option></select></label><div class="it-stage14-actions"><button class="btn btn--navy" type="button" onclick="stage14RunSearch()">🔎 Buscar</button><button class="btn btn--outline" type="button" onclick="stage14Clear()">Limpar</button></div></div><div id="stage14Results"></div>`;
  }

  function renderModal(){if(typeof window.modal!=='function')return;modalOpen=true;window.modal(`<div class="it-stage14-modal">${formHtml()}<div class="modal-actions"><button class="btn btn--outline" type="button" onclick="closeModal();window.IntegraTrampoStage14Search?.closed()">Fechar</button></div></div>`);renderResults()}

  window.openStage14Search=async function(initialType='all'){
    await getUser();loadSaved();
    if(['all','opportunity','professional'].includes(initialType))filters.entity_type=initialType;
    renderModal();
    await search();
  };
  window.stage14RunSearch=async function(){await search()};
  window.stage14Clear=async function(){filters={entity_type:document.getElementById('stage14Type')?.value||'all',query:'',category:'',city:'',min_rate:'',max_rate:'',min_rating:'',availability_status:'',service_date:'',min_affinity:'',sort:'relevance'};try{localStorage.removeItem('it_stage14_filters_v1')}catch{};renderModal();await search()};
  window.stage14Save=async function(type,id,value){
    if(typeof window.stage11SetFavorite!=='function'){tell('Entre na sua conta para salvar favoritos.');window.loginModal?.();return}
    const ok=await window.stage11SetFavorite(type,id,!!value);if(ok){await search()}
  };
  window.stage14OpenEntity=function(type,id){
    const item=(type==='professional'?result.professionals:result.opportunities).find(x=>String(x.id)===String(id));
    try{window.closeModal?.()}catch{};modalOpen=false;
    if(type==='professional'&&typeof window.openPro==='function'){try{return window.openPro(id)}catch{}}
    if(type==='opportunity'&&typeof window.openJob==='function'){try{return window.openJob(id)}catch{}}
    if(!item||typeof window.modal!=='function')return;
    if(type==='professional')window.modal(`<h2>${esc(item.display_name||'Profissional')}</h2><p class="muted">${esc(item.role_title||'')} · ${esc(item.city||'')}</p><p>${esc(item.bio||'')}</p><div class="money">${esc(money(item.reference_daily))}</div><div class="modal-actions"><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
    else window.modal(`<h2>${esc(item.title||'Vaga')}</h2><p class="muted">${esc(item.company_name||'')} · ${esc(item.category||'')} · ${esc(item.city||'')}</p><p>${esc(item.description||'')}</p><div class="meta"><span>📅 ${esc(fmtDate(item.service_date))}</span><span>⏰ ${esc(fmtRange(item.start_time,item.end_time))}</span></div><div class="money">${esc(money(item.daily_rate))}</div><div class="modal-actions"><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
  };

  function injectEntryButtons(){
    injectStyles();
    const add=(screen,type,label)=>{const bar=document.querySelector(`#screen-${screen} .searchbar`);if(!bar||bar.querySelector('[data-stage14-entry]'))return;const b=document.createElement('button');b.type='button';b.className='btn btn--navy it-stage14-entry';b.dataset.stage14Entry='1';b.textContent=`🔎 ${label}`;b.onclick=()=>window.openStage14Search(type);bar.appendChild(b)};
    add('vagas','opportunity','Busca avançada');add('profissionais','professional','Busca avançada');
  }

  const previousGo=window.go;if(typeof previousGo==='function')window.go=function(...args){const r=previousGo.apply(this,args);setTimeout(injectEntryButtons,40);return r};
  async function init(){injectStyles();loadSaved();await waitForSupabase();await getUser();injectEntryButtons();if(sb){try{sb.auth.onAuthStateChange((_,session)=>{currentUser=session?.user||null})}catch{}}}
  window.IntegraTrampoStage14Search={version:14,open:window.openStage14Search,search:async f=>{filters={...filters,...(f||{})};return search()},get data(){return result},get filters(){return {...filters}},closed(){modalOpen=false}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(e=>console.warn('[Stage14 init]',e)),{once:true});else init().catch(e=>console.warn('[Stage14 init]',e));
})();
