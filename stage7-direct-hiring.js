// IntegraTrampo · Etapa 7 · contratação direta
// Contratante envia proposta para um profissional específico; profissional aceita/recusa; aceite gera serviço.
(function(){
  if(window.IntegraTrampoStage7DirectHiring)return;

  let sb=null;
  let offers=[];
  let renderTimer=null;
  let renderBusy=false;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const money=v=>v===null||v===undefined||v===''?'A combinar':`R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtDate=v=>{if(!v)return 'A combinar';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(String(v).length===10?v+'T12:00:00':v))}catch{return String(v)}};
  const fmtTime=v=>v?String(v).slice(0,5):'';
  const statusLabel=v=>({pending:'Aguardando resposta',accepted:'Aceita',declined:'Recusada',cancelled:'Cancelada'}[v]||v||'—');
  const statusClass=v=>v==='accepted'?'is-ok':v==='pending'?'is-wait':'is-bad';

  function injectStyles(){
    if(document.getElementById('integratrampoStage7Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage7Styles';s.textContent=`
      .it-stage7{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#fff,#fbfcfe);padding:14px}.it-stage7__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage7__head h4{margin:0}.it-stage7__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#FF6B35;color:#fff}.it-stage7__list{display:grid;gap:10px;margin-top:11px}.it-stage7__item{border:1px solid #e4eaf0;border-radius:15px;background:#fff;padding:12px}.it-stage7__row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.it-stage7__item h5{margin:0;color:#0D1B2A;font-size:15px}.it-stage7__meta{font-size:12px;color:#687481;margin-top:4px}.it-stage7__status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900}.it-stage7__status.is-ok{background:#eafaf4;color:#087858}.it-stage7__status.is-wait{background:#fff7e5;color:#8a5a00}.it-stage7__status.is-bad{background:#fff0ef;color:#a93226}.it-stage7__actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.it-stage7__actions .btn{padding:8px 10px;font-size:12px}.it-stage7__desc{margin-top:8px;border-radius:11px;background:#f5f8fb;padding:9px 10px;font-size:12px;color:#56616c}.it-stage7-target{display:flex;gap:12px;align-items:center;margin:10px 0 14px}.it-stage7-target img{width:64px;height:64px;border-radius:16px;object-fit:cover;background:#eef2f6}.it-stage7-target h3{margin:0 0 3px}.it-stage7-help{font-size:12px;color:#687481;margin-top:9px}
      @media(max-width:620px){.it-stage7__actions .btn{flex:1}.it-stage7__row{align-items:stretch}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}

  async function refreshOffers(){
    if(!sb)await waitForSupabase();
    if(!sb){offers=[];return}
    try{const {data:{user}}=await sb.auth.getUser();if(!user){offers=[];return}const data=await rpc('it_my_direct_offers_v1');offers=Array.isArray(data)?data:[]}catch(e){console.warn('[Stage7 offers]',e);offers=[]}
  }

  function offerActions(o){
    if(o.status!=='pending')return o.status==='accepted'&&o.service_id?`<button class="btn btn--outline" onclick="focusStage7Service('${esc(o.service_id)}')">Ver serviço</button>`:'';
    if(o.viewer_side==='professional')return `<button class="btn btn--green" onclick="respondStage7Offer('${esc(o.id)}',true)">✅ Aceitar</button><button class="btn btn--outline" onclick="respondStage7Offer('${esc(o.id)}',false)">Recusar</button>`;
    return `<button class="btn btn--outline" onclick="cancelStage7Offer('${esc(o.id)}')">Cancelar proposta</button>`;
  }

  function offerCard(o){
    const other=o.viewer_side==='professional'?o.company_name:o.professional_name;
    const schedule=[fmtDate(o.service_date),o.start_time&&o.end_time?`${fmtTime(o.start_time)}–${fmtTime(o.end_time)}`:null].filter(Boolean).join(' · ');
    return `<article class="it-stage7__item"><div class="it-stage7__row"><div><h5>${esc(o.title||'Proposta direta')}</h5><div class="it-stage7__meta">${o.viewer_side==='professional'?'De':'Para'}: ${esc(other||'Usuário')} · ${esc(o.category||'')}</div></div><div style="text-align:right"><b>${esc(money(o.daily_rate))}</b><br><span class="it-stage7__status ${statusClass(o.status)}">${esc(statusLabel(o.status))}</span></div></div><div class="it-stage7__meta">📍 ${esc(o.city||'')} · 📅 ${esc(schedule)}</div>${o.description?`<div class="it-stage7__desc">${esc(o.description)}</div>`:''}<div class="it-stage7__actions">${offerActions(o)}</div></article>`;
  }

  function sectionHtml(){
    if(!offers.length)return '';
    return `<section class="it-stage7" id="itStage7DirectHiring"><div class="it-stage7__head"><div><h4>🎯 Propostas diretas</h4><div class="small muted">Convites enviados diretamente entre contratante e profissional.</div></div><span class="it-stage7__badge">ETAPA 7</span></div><div class="it-stage7__list">${offers.map(offerCard).join('')}</div></section>`;
  }

  async function renderOffers(){
    if(renderBusy)return;renderBusy=true;
    try{injectStyles();await refreshOffers();document.getElementById('itStage7DirectHiring')?.remove();const html=sectionHtml();if(!html)return;const flow=document.getElementById('serviceFlow');if(!flow)return;const holder=document.createElement('div');holder.innerHTML=html;const section=holder.firstElementChild;const s6=document.getElementById('itStage6Payments'),s5=document.getElementById('itStage5Safety'),match=document.getElementById('itMatchStage1');if(s6)s6.insertAdjacentElement('afterend',section);else if(s5)s5.insertAdjacentElement('afterend',section);else if(match)match.insertAdjacentElement('afterend',section);else flow.prepend(section)}finally{renderBusy=false}
  }
  function scheduleRender(delay=140){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderOffers().catch(e=>console.warn('[Stage7 render]',e)),delay)}

  async function ensureSignedIn(){if(!sb)await waitForSupabase();if(!sb)return null;try{const {data:{user}}=await sb.auth.getUser();return user||null}catch{return null}}

  window.openStage7DirectOffer=async function(professionalId){
    const user=await ensureSignedIn();
    if(!user){window.closeModal?.();tell('Entre na sua conta para enviar uma proposta direta.');setTimeout(()=>window.loginModal?.(),120);return}
    const p=(typeof window.publicPros!=='undefined'?window.publicPros:typeof publicPros!=='undefined'?publicPros:[]).find(x=>String(x.id)===String(professionalId));
    if(!p){tell('Profissional não encontrado.');return}
    if(typeof window.modal!=='function')return;
    const defaultDate=new Date(Date.now()+86400000);const yyyy=defaultDate.getFullYear(),mm=String(defaultDate.getMonth()+1).padStart(2,'0'),dd=String(defaultDate.getDate()).padStart(2,'0');
    window.modal(`<div class="notice">🎯 Esta proposta será enviada somente para <b>${esc(p.name)}</b>. Se ela for aceita, o serviço entra no fluxo normal de confirmação da IntegraTrampo.</div><div class="it-stage7-target"><img src="${esc(p.img||'')}" alt="Foto de ${esc(p.name)}"><div><h3>${esc(p.name)}</h3><div class="muted">${esc(p.role||'Profissional')} · ${esc(p.city||'Teodoro Sampaio')}</div></div></div><div class="form-grid"><div class="field full"><label>Título do serviço</label><input id="stage7Title" maxlength="120" value="${esc('Contratação de '+(p.role||'profissional'))}"></div><div class="field"><label>Categoria</label><input id="stage7Category" maxlength="120" value="${esc(p.role||'Serviço')}"></div><div class="field"><label>Cidade</label><input id="stage7City" maxlength="120" value="${esc(p.city||'Teodoro Sampaio')}"></div><div class="field"><label>Data</label><input id="stage7Date" type="date" value="${yyyy}-${mm}-${dd}"></div><div class="field"><label>Valor da diária</label><input id="stage7Rate" type="number" min="0.01" max="1000000" step="0.01" value="${esc(p.rate||'')}"></div><div class="field"><label>Início (opcional)</label><input id="stage7Start" type="time"></div><div class="field"><label>Fim (opcional)</label><input id="stage7End" type="time"></div><div class="field full"><label>Descrição</label><textarea id="stage7Description" maxlength="2000" placeholder="Explique o serviço, local, atividades e demais combinados"></textarea></div></div><div class="it-stage7-help">O profissional poderá aceitar ou recusar. Aceitar a proposta ainda não confirma sozinho o serviço: as duas partes continuam usando a confirmação bilateral.</div><div class="modal-actions"><button class="btn btn--green" id="stage7SendBtn" onclick="submitStage7DirectOffer('${esc(professionalId)}')">Enviar proposta</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.submitStage7DirectOffer=async function(professionalId){
    const btn=document.getElementById('stage7SendBtn'),title=document.getElementById('stage7Title')?.value.trim()||'',category=document.getElementById('stage7Category')?.value.trim()||'',city=document.getElementById('stage7City')?.value.trim()||'',date=document.getElementById('stage7Date')?.value||'',rate=Number(document.getElementById('stage7Rate')?.value||0),start=document.getElementById('stage7Start')?.value||null,end=document.getElementById('stage7End')?.value||null,description=document.getElementById('stage7Description')?.value.trim()||null;
    if(title.length<3||category.length<2||city.length<2||!date||!Number.isFinite(rate)||rate<=0)return tell('Preencha título, categoria, cidade, data e valor.');
    if((start&&!end)||(!start&&end))return tell('Informe os dois horários ou deixe os dois em branco.');
    if(start&&end&&end<=start)return tell('O horário final precisa ser depois do inicial.');
    if(btn){btn.disabled=true;btn.textContent='Enviando...'}
    try{await rpc('it_create_direct_offer_v1',{p_professional_id:professionalId,p_title:title,p_category:category,p_description:description,p_city:city,p_service_date:date,p_start_time:start,p_end_time:end,p_daily_rate:rate});window.closeModal?.();tell('Proposta direta enviada ao profissional.');scheduleRender(80)}catch(e){console.error('[Stage7 create]',e);const m=String(e?.message||e||'');if(m.includes('published_company_required'))tell('Crie e publique seu perfil de contratante antes de enviar propostas diretas.');else if(m.includes('duplicate_pending_offer'))tell('Já existe uma proposta pendente igual para esse profissional e data.');else if(m.includes('professional_not_available'))tell('Esse profissional não está disponível para proposta direta.');else if(m.includes('cannot_hire_yourself'))tell('Você não pode enviar uma proposta para o próprio perfil.');else if(m.includes('invalid_service_date'))tell('Escolha uma data válida, a partir de hoje.');else tell('Não foi possível enviar a proposta agora.');if(btn){btn.disabled=false;btn.textContent='Enviar proposta'}}
  };

  window.respondStage7Offer=async function(offerId,accept){
    if(!accept&&!confirm('Recusar esta proposta direta?'))return;
    if(accept&&!confirm('Aceitar esta proposta? Ela será transformada em um serviço que ainda precisará da confirmação das duas partes.'))return;
    try{const r=await rpc('it_respond_direct_offer_v1',{p_offer_id:offerId,p_accept:!!accept});tell(accept?'Proposta aceita. O serviço foi criado.':'Proposta recusada.');scheduleRender(60);try{await window.IntegraTrampoMatchV9?.refresh?.()}catch{};return r}catch(e){console.error('[Stage7 respond]',e);const m=String(e?.message||e||'');if(m.includes('offer_not_pending'))tell('Essa proposta já foi respondida ou cancelada.');else if(m.includes('offer_expired'))tell('A data dessa proposta já passou.');else tell('Não foi possível responder à proposta agora.')}
  };

  window.cancelStage7Offer=async function(offerId){
    if(!confirm('Cancelar esta proposta enquanto ela ainda está pendente?'))return;
    try{await rpc('it_cancel_my_direct_offer_v1',{p_offer_id:offerId});tell('Proposta cancelada.');scheduleRender(60)}catch(e){console.error('[Stage7 cancel]',e);tell('Não foi possível cancelar essa proposta agora.')}
  };

  window.focusStage7Service=function(serviceId){
    try{window.go?.('painel')}catch{}
    setTimeout(()=>{const el=document.querySelector(`[data-match-service="${CSS.escape(String(serviceId))}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.animate?.([{outline:'3px solid #FF6B35'},{outline:'0 solid transparent'}],{duration:1600})}},180);
  };

  function installProfileHook(){
    const previous=window.openPro;if(typeof previous!=='function'||previous.__stage7Wrapped)return;
    const wrapped=function(id){const r=previous.apply(this,arguments);setTimeout(()=>{const root=document.getElementById('modalRoot');if(!root)return;for(const b of root.querySelectorAll('.modal-actions button')){if((b.textContent||'').trim()==='Quero contratar'){b.onclick=()=>{window.closeModal?.();window.openStage7DirectOffer(id)};break}}},0);return r};wrapped.__stage7Wrapped=true;window.openPro=wrapped;
  }

  const previousRenderPanel=window.renderPanel;
  if(typeof previousRenderPanel==='function')window.renderPanel=async function(...args){const r=await previousRenderPanel.apply(this,args);scheduleRender(230);return r};
  const previousUserPanelTab=window.userPanelTab;
  if(typeof previousUserPanelTab==='function')window.userPanelTab=function(...args){const r=previousUserPanelTab.apply(this,args);scheduleRender(150);return r};

  async function init(){injectStyles();await waitForSupabase();installProfileHook();if(!sb)return;scheduleRender(300);try{sb.auth.onAuthStateChange(()=>scheduleRender(180))}catch{};setTimeout(installProfileHook,900)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.IntegraTrampoStage7DirectHiring={version:1,get offers(){return offers},refresh:renderOffers};
})();
