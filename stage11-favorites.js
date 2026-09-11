// IntegraTrampo · Etapa 11 · favoritos sincronizados
// Vagas e profissionais salvos ficam ligados à conta; visitantes continuam com o favorito local legado.
(function(){
  if(window.IntegraTrampoStage11Favorites)return;

  let sb=null;
  let currentUser=null;
  let favorites={authenticated:false,professionals:[],opportunities:[],counts:{professionals:0,opportunities:0,total:0}};
  let professionalIds=new Set();
  let opportunityIds=new Set();
  let renderTimer=null;
  let renderBusy=false;
  let deviceJobFavorites=[];
  let modalOpen=false;

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const money=v=>v===null||v===undefined||v===''?'A combinar':`R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtDate=v=>{if(!v)return 'A combinar';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(String(v).length===10?v+'T12:00:00':v))}catch{return String(v)}};
  const fmtTime=v=>v?String(v).slice(0,5):'';
  const fmtRange=(a,b)=>a&&b?`${fmtTime(a)}–${fmtTime(b)}${String(b)<String(a)?' (+1 dia)':''}`:'A combinar';

  try{if(typeof state!=='undefined'&&Array.isArray(state?.fav))deviceJobFavorites=[...new Set(state.fav.map(String))]}catch{}

  function injectStyles(){
    if(document.getElementById('integratrampoStage11Styles'))return;
    const s=document.createElement('style');
    s.id='integratrampoStage11Styles';
    s.textContent=`
      .it-stage11{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#fffdf6,#fff);padding:14px}.it-stage11__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage11__head h4{margin:0}.it-stage11__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#f4b400;color:#382c00}.it-stage11__summary{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.it-stage11__chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#fff7d6;color:#6f5600;padding:6px 9px;font-size:11px;font-weight:900}.it-stage11__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:11px}.it-stage11__item{border:1px solid #e6e9ed;border-radius:14px;background:#fff;padding:11px;display:grid;grid-template-columns:auto 1fr;gap:10px;align-items:start}.it-stage11__thumb{width:48px;height:48px;border-radius:13px;object-fit:cover;background:#eef2f6;display:grid;place-items:center;font-size:22px}.it-stage11__item h5{margin:0 0 3px;font-size:13px;color:#0D1B2A}.it-stage11__meta{font-size:11px;color:#687481;line-height:1.45}.it-stage11__actions{grid-column:1/-1;display:flex;gap:6px;flex-wrap:wrap}.it-stage11__actions .btn{font-size:11px;padding:6px 8px}.it-stage11__empty{margin-top:10px;border-radius:13px;background:#f7f9fb;color:#65717d;padding:12px;font-size:12px}.it-stage11__foot{display:flex;justify-content:space-between;gap:8px;flex-wrap:wrap;align-items:center;margin-top:10px}.it-stage11-import{font-size:11px;color:#687481}.it-stage11-modal{max-width:780px}.it-stage11-modal__scroll{max-height:58vh;overflow:auto;padding-right:2px}.it-stage11-modal__section{margin-top:16px}.it-stage11-modal__section h3{margin:0 0 8px}.it-stage11-save-btn.is-saved{background:#fff7d6;border-color:#e4bd34;color:#6f5600}.it-stage11-save-btn{white-space:nowrap}
      @media(max-width:650px){.it-stage11__grid{grid-template-columns:1fr}.it-stage11__item{grid-template-columns:auto 1fr}.it-stage11__actions .btn{flex:1}.it-stage11__foot>.btn{width:100%}}
    `;
    document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function getUser(){if(!sb)await waitForSupabase();if(!sb)return null;try{const {data:{user}}=await sb.auth.getUser();currentUser=user||null;return currentUser}catch{currentUser=null;return null}}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}

  function normalize(data){
    const d=data&&typeof data==='object'?data:{};
    favorites={
      authenticated:!!d.authenticated,
      professionals:Array.isArray(d.professionals)?d.professionals:[],
      opportunities:Array.isArray(d.opportunities)?d.opportunities:[],
      counts:{professionals:Number(d.counts?.professionals||0),opportunities:Number(d.counts?.opportunities||0),total:Number(d.counts?.total||0)}
    };
    professionalIds=new Set(favorites.professionals.map(x=>String(x.id)));
    opportunityIds=new Set(favorites.opportunities.map(x=>String(x.id)));
    return favorites;
  }

  function syncLegacyJobHearts(loggedIn){
    try{
      if(typeof state==='undefined'||!state||!Array.isArray(state.fav))return;
      state.fav=loggedIn?[...opportunityIds]:[...deviceJobFavorites];
      if(typeof renderJobs==='function'&&document.getElementById('jobGrid'))renderJobs();
      if(typeof renderHome==='function'&&document.getElementById('homeJobs'))renderHome();
    }catch(e){console.warn('[Stage11 legacy hearts]',e)}
  }

  async function refresh(){
    const user=await getUser();
    if(!user){normalize(null);syncLegacyJobHearts(false);return favorites}
    try{normalize(await rpc('it_my_favorites_v1'));syncLegacyJobHearts(true);return favorites}catch(e){console.warn('[Stage11 favorites]',e);return favorites}
  }

  function proCard(p,compact=false){
    const img=p.img?`<img class="it-stage11__thumb" src="${esc(p.img)}" alt="Foto de ${esc(p.name||'profissional')}">`:`<div class="it-stage11__thumb">👤</div>`;
    const actions=compact?'':`<div class="it-stage11__actions"><button class="btn btn--outline" type="button" onclick="openPro('${esc(p.id)}')">Ver perfil</button>${typeof window.openStage7DirectOffer==='function'?`<button class="btn btn--green" type="button" onclick="openStage7DirectOffer('${esc(p.id)}')">Contratar</button>`:''}<button class="btn btn--outline" type="button" onclick="stage11SetFavorite('professional','${esc(p.id)}',false)">Remover</button></div>`;
    return `<article class="it-stage11__item">${img}<div><h5>⭐ ${esc(p.name||'Profissional')}</h5><div class="it-stage11__meta">${esc(p.role||'Profissional')} · ${esc(p.city||'')}</div><div class="it-stage11__meta">${p.rating!==null&&p.rating!==undefined?`⭐ ${esc(p.rating)} · `:''}${esc(money(p.rate))}</div></div>${actions}</article>`;
  }

  function jobCard(o,compact=false){
    const img=o.img?`<img class="it-stage11__thumb" src="${esc(o.img)}" alt="Imagem da vaga ${esc(o.title||'')}">`:`<div class="it-stage11__thumb">💼</div>`;
    const schedule=`${fmtDate(o.service_date)} · ${fmtRange(o.start_time,o.end_time)}`;
    const actions=compact?'':`<div class="it-stage11__actions"><button class="btn btn--green" type="button" onclick="openJob('${esc(o.id)}')">Ver vaga</button><button class="btn btn--outline" type="button" onclick="stage11SetFavorite('opportunity','${esc(o.id)}',false)">Remover</button></div>`;
    return `<article class="it-stage11__item">${img}<div><h5>♥ ${esc(o.title||'Vaga salva')}</h5><div class="it-stage11__meta">${esc(o.company||'Contratante')} · ${esc(o.cat||'')}</div><div class="it-stage11__meta">${esc(schedule)} · ${esc(money(o.rate))}</div></div>${actions}</article>`;
  }

  function localImportCandidates(){
    if(!currentUser||!deviceJobFavorites.length)return [];
    const published=new Set((typeof publicJobs!=='undefined'&&Array.isArray(publicJobs)?publicJobs:[]).map(x=>String(x.id)));
    return deviceJobFavorites.filter(id=>published.has(String(id))&&!opportunityIds.has(String(id))).slice(0,25);
  }

  function sectionHtml(){
    const pros=favorites.professionals||[],jobs=favorites.opportunities||[],top=[...pros.slice(0,2).map(p=>proCard(p,true)),...jobs.slice(0,2).map(o=>jobCard(o,true))];
    const importable=localImportCandidates();
    return `<section class="it-stage11" id="itStage11Favorites"><div class="it-stage11__head"><div><h4>⭐ Meus favoritos</h4><div class="small muted">Sua lista pessoal de profissionais e vagas para voltar rápido depois.</div></div><span class="it-stage11__badge">ETAPA 11</span></div><div class="it-stage11__summary"><span class="it-stage11__chip">👤 ${Number(favorites.counts?.professionals||0)} profissional(is)</span><span class="it-stage11__chip">💼 ${Number(favorites.counts?.opportunities||0)} vaga(s)</span></div>${top.length?`<div class="it-stage11__grid">${top.join('')}</div>`:`<div class="it-stage11__empty">Ainda não há favoritos na sua conta. Abra uma vaga ou perfil e toque em <b>Salvar</b>.</div>`}<div class="it-stage11__foot">${importable.length?`<div class="it-stage11-import">Há ${importable.length} vaga(s) salva(s) neste aparelho. <button class="text-btn" type="button" onclick="stage11ImportDeviceFavorites()">Importar para minha conta</button></div>`:'<span></span>'}<button class="btn btn--navy" type="button" onclick="openStage11Favorites()">Abrir favoritos</button></div></section>`;
  }

  async function renderSection(){
    if(renderBusy)return;renderBusy=true;
    try{
      injectStyles();await refresh();document.getElementById('itStage11Favorites')?.remove();
      if(!currentUser)return;
      const flow=document.getElementById('serviceFlow');if(!flow)return;
      const holder=document.createElement('div');holder.innerHTML=sectionHtml();const section=holder.firstElementChild;if(!section)return;
      const s10=document.getElementById('itStage10Activity'),s9=document.getElementById('itStage9Chat'),s8=document.getElementById('itStage8Schedule');
      if(s10)s10.insertAdjacentElement('afterend',section);else if(s9)s9.insertAdjacentElement('afterend',section);else if(s8)s8.insertAdjacentElement('afterend',section);else flow.prepend(section);
    }finally{renderBusy=false}
  }
  function scheduleRender(delay=140){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderSection().catch(e=>console.warn('[Stage11 render]',e)),delay)}

  function renderModal(){
    if(typeof window.modal!=='function')return;
    modalOpen=true;
    const pros=favorites.professionals||[],jobs=favorites.opportunities||[];
    const pHtml=pros.length?`<div class="it-stage11__grid">${pros.map(p=>proCard(p,false)).join('')}</div>`:`<div class="it-stage11__empty">Nenhum profissional salvo ainda.</div>`;
    const jHtml=jobs.length?`<div class="it-stage11__grid">${jobs.map(o=>jobCard(o,false)).join('')}</div>`:`<div class="it-stage11__empty">Nenhuma vaga salva na sua conta neste momento.</div>`;
    window.modal(`<div class="it-stage11-modal"><div class="notice">⭐ Seus favoritos ficam ligados à sua conta. Se uma vaga deixar de estar publicada, ela deixa de aparecer aqui; perfis também precisam continuar ativos.</div><h2>Meus favoritos</h2><div class="it-stage11-modal__scroll"><section class="it-stage11-modal__section"><h3>👤 Profissionais salvos (${pros.length})</h3>${pHtml}</section><section class="it-stage11-modal__section"><h3>💼 Vagas salvas (${jobs.length})</h3>${jHtml}</section></div><div class="modal-actions"><button class="btn btn--outline" type="button" onclick="closeModal();window.IntegraTrampoStage11Favorites?.closed()">Fechar</button></div></div>`);
  }

  async function ensureSignedInForSave(){
    const user=await getUser();
    if(user)return user;
    tell('Entre na sua conta para sincronizar favoritos entre aparelhos.');
    setTimeout(()=>window.loginModal?.(),120);
    return null;
  }

  window.stage11SetFavorite=async function(type,id,value){
    if(!await ensureSignedInForSave())return false;
    try{
      await rpc('it_set_my_favorite_v1',{p_entity_type:type,p_entity_id:id,p_favorite:!!value});
      await refresh();scheduleRender(20);
      if(modalOpen)setTimeout(()=>renderModal(),40);
      tell(value?(type==='professional'?'Profissional salvo nos favoritos.':'Vaga salva nos favoritos.'):'Removido dos favoritos.');
      return true;
    }catch(e){
      console.error('[Stage11 set]',e);const m=String(e?.message||e||'');
      if(m.includes('cannot_favorite_yourself'))tell('Você não precisa salvar o próprio perfil.');
      else if(m.includes('favorite_entity_not_available'))tell('Esse item não está mais disponível para salvar.');
      else tell('Não foi possível atualizar seus favoritos agora.');
      return false;
    }
  };

  const legacyToggleFav=window.toggleFav;
  window.toggleFav=async function(id){
    const user=await getUser();
    if(!user){
      if(typeof legacyToggleFav==='function')legacyToggleFav.apply(this,arguments);
      try{if(typeof state!=='undefined'&&Array.isArray(state?.fav))deviceJobFavorites=[...new Set(state.fav.map(String))]}catch{}
      tell('Favorito salvo neste aparelho. Entre para sincronizar com sua conta.');
      return;
    }
    const value=!opportunityIds.has(String(id));
    return window.stage11SetFavorite('opportunity',id,value);
  };

  window.stage11ToggleProfessional=async function(id){
    const value=!professionalIds.has(String(id));
    return window.stage11SetFavorite('professional',id,value);
  };

  window.stage11ImportDeviceFavorites=async function(){
    if(!await ensureSignedInForSave())return;
    const ids=localImportCandidates();
    if(!ids.length){tell('Não há favoritos locais para importar.');return}
    let imported=0;
    for(const id of ids){try{await rpc('it_set_my_favorite_v1',{p_entity_type:'opportunity',p_entity_id:id,p_favorite:true});imported++}catch(e){console.warn('[Stage11 import]',id,e)}}
    await refresh();scheduleRender(20);tell(`${imported} favorito(s) importado(s) para sua conta.`);
  };

  window.openStage11Favorites=async function(){
    const user=await getUser();
    if(!user){if(typeof window.modal==='function')window.modal(`<div class="notice">⭐ Entre para ter favoritos sincronizados em qualquer aparelho.</div><h2>Meus favoritos</h2><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();loginModal()">Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);return}
    try{await refresh();renderModal()}catch(e){console.error('[Stage11 modal]',e);tell('Não foi possível abrir seus favoritos agora.')}
  };

  function decorateProfessionalModal(id){
    const root=document.getElementById('modalRoot');const actions=root?.querySelector('.modal-actions');if(!actions||actions.querySelector('[data-stage11-pro]'))return;
    const b=document.createElement('button');b.type='button';b.dataset.stage11Pro=String(id);b.className=`btn btn--outline it-stage11-save-btn ${professionalIds.has(String(id))?'is-saved':''}`;b.textContent=professionalIds.has(String(id))?'♥ Salvo':'♡ Salvar profissional';b.onclick=()=>window.stage11ToggleProfessional(id);actions.insertBefore(b,actions.lastElementChild||null);
  }

  function decorateOpportunityModal(id){
    const root=document.getElementById('modalRoot');const actions=root?.querySelector('.modal-actions');if(!actions||actions.querySelector('[data-stage11-job]'))return;
    const b=document.createElement('button');b.type='button';b.dataset.stage11Job=String(id);b.className=`btn btn--outline it-stage11-save-btn ${opportunityIds.has(String(id))?'is-saved':''}`;b.textContent=opportunityIds.has(String(id))?'♥ Salva':'♡ Salvar vaga';b.onclick=()=>window.toggleFav(id);actions.insertBefore(b,actions.lastElementChild||null);
  }

  function installModalHooks(){
    const previousPro=window.openPro;
    if(typeof previousPro==='function'&&!previousPro.__stage11Wrapped){const wrapped=function(id){const r=previousPro.apply(this,arguments);setTimeout(()=>decorateProfessionalModal(id),0);return r};wrapped.__stage11Wrapped=true;window.openPro=wrapped}
    const previousJob=window.openJob;
    if(typeof previousJob==='function'&&!previousJob.__stage11Wrapped){const wrapped=function(id){const r=previousJob.apply(this,arguments);setTimeout(()=>decorateOpportunityModal(id),0);return r};wrapped.__stage11Wrapped=true;window.openJob=wrapped}
  }

  function installPanelHook(){
    const previous=window.renderPanel;if(typeof previous!=='function'||previous.__stage11Wrapped)return;
    const wrapped=function(){const r=previous.apply(this,arguments);scheduleRender(160);return r};wrapped.__stage11Wrapped=true;window.renderPanel=wrapped;
  }

  async function init(){
    injectStyles();await waitForSupabase();installModalHooks();installPanelHook();
    if(sb){try{sb.auth.onAuthStateChange(()=>{modalOpen=false;scheduleRender(180)})}catch{}}
    await refresh();
    if(document.getElementById('screen-painel')?.classList.contains('is-active'))scheduleRender(20);
  }

  window.IntegraTrampoStage11Favorites={
    version:11,
    refresh:async()=>{await refresh();scheduleRender(0);return favorites},
    isFavorite:(type,id)=>type==='professional'?professionalIds.has(String(id)):opportunityIds.has(String(id)),
    open:window.openStage11Favorites,
    closed:()=>{modalOpen=false;scheduleRender(40)},
    render:()=>scheduleRender(0)
  };

  setTimeout(()=>init().catch(e=>console.warn('[Stage11 init]',e)),0);
})();