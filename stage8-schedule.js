// IntegraTrampo · Etapa 8 · agenda e prevenção de conflitos
// Consolida compromissos ativos e traduz conflitos de horário em mensagens úteis.
(function(){
  if(window.IntegraTrampoStage8Schedule)return;

  let sb=null;
  let items=[];
  let renderTimer=null;
  let renderBusy=false;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const money=v=>v===null||v===undefined||v===''?'A combinar':`R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtDate=v=>{if(!v)return 'A combinar';try{return new Intl.DateTimeFormat('pt-BR',{weekday:'short',day:'2-digit',month:'2-digit'}).format(new Date(String(v).length===10?v+'T12:00:00':v))}catch{return String(v)}};
  const fmtTime=v=>v?String(v).slice(0,5):'';
  const statusLabel=v=>v==='confirmed'?'Confirmado':'Aguardando confirmação';
  const statusClass=v=>v==='confirmed'?'is-ok':'is-wait';

  function injectStyles(){
    if(document.getElementById('integratrampoStage8Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage8Styles';s.textContent=`
      .it-stage8{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#fff,#fbfcfe);padding:14px}.it-stage8__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage8__head h4{margin:0}.it-stage8__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#16B898;color:#fff}.it-stage8__list{display:grid;gap:9px;margin-top:11px}.it-stage8__item{display:grid;grid-template-columns:74px 1fr auto;gap:11px;align-items:center;border:1px solid #e4eaf0;border-radius:15px;background:#fff;padding:11px}.it-stage8__date{text-align:center;border-radius:12px;background:#f3f7fa;padding:8px 5px;font-size:11px;font-weight:900;color:#0D1B2A}.it-stage8__item h5{margin:0 0 3px;font-size:14px;color:#0D1B2A}.it-stage8__meta{font-size:12px;color:#687481}.it-stage8__status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900;white-space:nowrap}.it-stage8__status.is-ok{background:#eafaf4;color:#087858}.it-stage8__status.is-wait{background:#fff7e5;color:#8a5a00}.it-stage8__confirm{font-size:11px;color:#687481;margin-top:5px}.it-stage8__source{display:inline-block;margin-left:5px;border-radius:999px;background:#f1f4f7;padding:2px 6px;font-size:10px}.it-stage8__footer{font-size:12px;color:#687481;margin-top:10px;padding:9px 10px;border-radius:11px;background:#f5f8fb}.it-stage8__item button{padding:7px 9px;font-size:11px}
      @media(max-width:620px){.it-stage8__item{grid-template-columns:62px 1fr}.it-stage8__item>div:last-child{grid-column:1/-1;display:flex;justify-content:space-between;align-items:center;gap:8px}.it-stage8__status{white-space:normal}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}

  async function refreshItems(){
    if(!sb)await waitForSupabase();
    if(!sb){items=[];return}
    try{const {data:{user}}=await sb.auth.getUser();if(!user){items=[];return}const data=await rpc('it_my_schedule_v1');items=Array.isArray(data)?data:[]}catch(e){console.warn('[Stage8 schedule]',e);items=[]}
  }

  function confirmations(i){
    const pro=i.professional_confirmed_at?'✅':'○',company=i.company_confirmed_at?'✅':'○';
    return `${pro} Profissional · ${company} Contratante`;
  }

  function itemCard(i){
    const counterpart=i.viewer_side==='professional'?i.company_name:i.professional_name;
    const time=i.start_time&&i.end_time?`${fmtTime(i.start_time)}–${fmtTime(i.end_time)}`:'Horário não definido';
    const source=i.source_type==='direct_offer'?'Proposta direta':'Vaga';
    return `<article class="it-stage8__item"><div class="it-stage8__date">${esc(fmtDate(i.service_date))}<br><span>${esc(time)}</span></div><div><h5>${esc(i.job_title||'Serviço')}</h5><div class="it-stage8__meta">${esc(counterpart||'Participante')} · ${esc(i.category||'')}<span class="it-stage8__source">${esc(source)}</span></div><div class="it-stage8__meta">📍 ${esc(i.city||'')} · 💰 ${esc(money(i.daily_rate))}</div><div class="it-stage8__confirm">${confirmations(i)}</div></div><div><span class="it-stage8__status ${statusClass(i.status)}">${esc(statusLabel(i.status))}</span><div style="margin-top:7px"><button class="btn btn--outline" onclick="focusStage8Service('${esc(i.service_id)}')">Ver serviço</button></div></div></article>`;
  }

  function sectionHtml(){
    if(!items.length)return '';
    return `<section class="it-stage8" id="itStage8Schedule"><div class="it-stage8__head"><div><h4>📅 Minha agenda</h4><div class="small muted">Seus próximos serviços reservados e confirmados.</div></div><span class="it-stage8__badge">ETAPA 8</span></div><div class="it-stage8__list">${items.map(itemCard).join('')}</div><div class="it-stage8__footer">🛡️ A IntegraTrampo impede novas seleções ou propostas aceitas que coincidam com um compromisso ativo. Quando não há horário definido, o dia inteiro é considerado ocupado.</div></section>`;
  }

  async function renderSchedule(){
    if(renderBusy)return;renderBusy=true;
    try{
      injectStyles();await refreshItems();document.getElementById('itStage8Schedule')?.remove();const html=sectionHtml();if(!html)return;const flow=document.getElementById('serviceFlow');if(!flow)return;
      const holder=document.createElement('div');holder.innerHTML=html;const section=holder.firstElementChild;
      const s7=document.getElementById('itStage7DirectHiring'),s6=document.getElementById('itStage6Payments'),s5=document.getElementById('itStage5Safety'),match=document.getElementById('itMatchStage1');
      if(s7)s7.insertAdjacentElement('afterend',section);else if(s6)s6.insertAdjacentElement('afterend',section);else if(s5)s5.insertAdjacentElement('afterend',section);else if(match)match.insertAdjacentElement('afterend',section);else flow.prepend(section);
    }finally{renderBusy=false}
  }
  function scheduleRender(delay=140){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderSchedule().catch(e=>console.warn('[Stage8 render]',e)),delay)}

  window.focusStage8Service=function(serviceId){
    try{window.go?.('painel')}catch{}
    setTimeout(()=>{const sel=`[data-match-service="${CSS.escape(String(serviceId))}"]`,el=document.querySelector(sel);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.animate?.([{outline:'3px solid #16B898'},{outline:'0 solid transparent'}],{duration:1600})}},180);
  };

  function installApplicationGuard(){
    const previous=window.setApplicationStatus;if(typeof previous!=='function'||previous.__stage8Wrapped)return;
    const wrapped=async function(id,status){
      const normalized=status==='rejected'?'declined':status;
      if(normalized!=='selected')return previous.apply(this,arguments);
      try{
        await rpc('it_company_set_application_status',{p_application_id:id,p_status:'selected'});
        tell('Profissional selecionado');
        await window.renderPanel?.();
        try{await window.IntegraTrampoMatchV9?.refresh?.()}catch{}
        scheduleRender(80);
      }catch(e){
        console.error('[Stage8 selection]',e);const m=String(e?.message||e||'');
        if(m.includes('professional_schedule_conflict'))tell('Esse profissional já tem outro serviço nesse horário. Escolha outro profissional ou ajuste a data/horário.');
        else if(m.includes('opportunity_full'))tell('Essa vaga já atingiu o número máximo de profissionais selecionados.');
        else tell('Não foi possível selecionar esse profissional agora.');
      }
    };wrapped.__stage8Wrapped=true;window.setApplicationStatus=wrapped;
  }

  function installDirectOfferGuard(){
    const previous=window.respondStage7Offer;if(typeof previous!=='function'||previous.__stage8Wrapped)return;
    const wrapped=async function(offerId,accept){
      if(!accept)return previous.apply(this,arguments);
      if(!confirm('Aceitar esta proposta? Ela será transformada em um serviço que ainda precisará da confirmação das duas partes.'))return;
      try{
        const r=await rpc('it_respond_direct_offer_v1',{p_offer_id:offerId,p_accept:true});
        tell('Proposta aceita. O serviço foi criado.');
        try{await window.IntegraTrampoStage7DirectHiring?.refresh?.()}catch{}
        try{await window.IntegraTrampoMatchV9?.refresh?.()}catch{}
        scheduleRender(60);return r;
      }catch(e){
        console.error('[Stage8 direct offer]',e);const m=String(e?.message||e||'');
        if(m.includes('professional_schedule_conflict'))tell('Você já tem outro serviço nesse horário. Recuse esta proposta ou combine outra data/horário com o contratante.');
        else if(m.includes('offer_not_pending'))tell('Essa proposta já foi respondida ou cancelada.');
        else if(m.includes('offer_expired'))tell('A data dessa proposta já passou.');
        else tell('Não foi possível aceitar a proposta agora.');
      }
    };wrapped.__stage8Wrapped=true;window.respondStage7Offer=wrapped;
  }

  function installHooks(){installApplicationGuard();installDirectOfferGuard()}
  const previousRenderPanel=window.renderPanel;
  if(typeof previousRenderPanel==='function')window.renderPanel=async function(...args){const r=await previousRenderPanel.apply(this,args);installHooks();scheduleRender(240);return r};
  const previousUserPanelTab=window.userPanelTab;
  if(typeof previousUserPanelTab==='function')window.userPanelTab=function(...args){const r=previousUserPanelTab.apply(this,args);installHooks();scheduleRender(150);return r};

  async function init(){injectStyles();await waitForSupabase();installHooks();if(!sb)return;scheduleRender(320);try{sb.auth.onAuthStateChange(()=>scheduleRender(180))}catch{};setTimeout(installHooks,1000)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.IntegraTrampoStage8Schedule={version:1,get items(){return items},refresh:renderSchedule};
})();
