// IntegraTrampo · Etapa 5 · segurança operacional e acompanhamento de incidentes
(function(){
  if(window.IntegraTrampoStage5Safety)return;

  let sb=null;
  let incidents=[];
  let renderTimer=null;
  let renderBusy=false;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const fmtDateTime=v=>{if(!v)return '';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
  const statusLabel=v=>({open:'Aberto',under_review:'Em análise',founded:'Procedente',unfounded:'Improcedente',resolved:'Resolvido'}[v]||v||'Aberto');
  const reasonLabel=v=>({no_show:'No-show / ausência',late_cancellation:'Cancelamento em cima da hora',payment_mismatch:'Pagamento divergente',unsafe_location:'Local inseguro',inappropriate_behavior:'Comportamento inadequado',fraud:'Suspeita de fraude',other:'Outro'}[v]||v||'Outro');
  const statusClass=v=>['resolved','founded'].includes(v)?'is-ok':v==='unfounded'?'is-neutral':v==='under_review'?'is-review':'is-open';

  function injectStyles(){
    if(document.getElementById('integratrampoStage5Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage5Styles';s.textContent=`
      .it-stage5{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#fff,#fbfcfe);padding:14px}.it-stage5__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage5__head h4{margin:0}.it-stage5__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#0D1B2A;color:#fff}.it-stage5__list{display:grid;gap:9px;margin-top:10px}.it-stage5__item{border:1px solid #e5eaf0;border-radius:14px;padding:11px;background:#fff}.it-stage5__row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.it-stage5__item b{display:block;color:#0D1B2A}.it-stage5__meta{font-size:12px;color:#687481;margin-top:3px}.it-stage5__details{font-size:12px;color:#56616c;margin-top:8px}.it-stage5__status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900}.it-stage5__status.is-open{background:#fff4e5;color:#8a5a00}.it-stage5__status.is-review{background:#edf4ff;color:#285b8f}.it-stage5__status.is-ok{background:#eafaf4;color:#087858}.it-stage5__status.is-neutral{background:#f1f4f7;color:#5e6872}.it-stage5-inline{margin-top:10px;border:1px solid #eadfbf;border-radius:13px;background:#fffbef;padding:10px 11px}.it-stage5-inline .it-stage5__row{align-items:center}.it-stage5-inline p{margin:5px 0 0;font-size:12px;color:#665f50}.it-stage5-help{font-size:12px;color:#687481;margin-top:8px}
      @media(max-width:620px){.it-stage5__row{align-items:stretch}.it-stage5__status{align-self:flex-start}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){
    for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);
    sb=window.IntegraTrampoSupabase||null;
    return sb;
  }

  async function rpc(name,args={}){
    if(!sb)await waitForSupabase();
    if(!sb)throw new Error('supabase_unavailable');
    const {data,error}=await sb.rpc(name,args);
    if(error)throw error;
    return data;
  }

  async function fetchIncidents(){
    if(!sb)await waitForSupabase();
    if(!sb){incidents=[];return incidents}
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user){incidents=[];return incidents}
      const data=await rpc('it_my_incidents_v1');
      incidents=Array.isArray(data)?data:[];
    }catch(e){
      console.warn('[Stage5 incidents]',e);
      incidents=[];
    }
    return incidents;
  }

  function scheduleRender(delay=140){
    clearTimeout(renderTimer);
    renderTimer=setTimeout(()=>renderSafety().catch(e=>console.warn('[Stage5 render]',e)),delay);
  }

  function latestForService(serviceId){
    return incidents.find(i=>String(i.service_id)===String(serviceId))||null;
  }

  function decorateMatchCards(){
    document.querySelectorAll('[data-match-service]').forEach(card=>{
      card.querySelector('.it-stage5-inline')?.remove();
      const serviceId=card.getAttribute('data-match-service');
      const incident=latestForService(serviceId);
      if(!incident)return;
      const box=document.createElement('div');
      box.className='it-stage5-inline';
      box.innerHTML=`<div class="it-stage5__row"><div><b>🛡️ Relato de segurança</b><div class="it-stage5__meta">${esc(reasonLabel(incident.reason))}</div></div><span class="it-stage5__status ${statusClass(incident.status)}">${esc(statusLabel(incident.status))}</span></div><p>${incident.details?esc(incident.details):'Seu relato foi registrado e está vinculado a este serviço.'}</p>`;
      const action=card.querySelector(':scope > .it-match-actions:last-child');
      if(action)action.insertAdjacentElement('beforebegin',box);else card.appendChild(box);
    });
  }

  function safetySectionHtml(){
    if(!incidents.length)return '';
    return `<section class="it-stage5" id="itStage5Safety"><div class="it-stage5__head"><div><h4>🛡️ Segurança e suporte</h4><div class="small muted">Acompanhe relatos enviados pela sua conta. Nenhuma punição é automática.</div></div><span class="it-stage5__badge">ETAPA 5</span></div><div class="it-stage5__list">${incidents.map(i=>`<article class="it-stage5__item"><div class="it-stage5__row"><div><b>${esc(i.job_title||'Serviço')}</b><div class="it-stage5__meta">${esc(reasonLabel(i.reason))} · ${esc(i.counterparty_name||'Outra parte')} · ${esc(fmtDateTime(i.created_at))}</div></div><span class="it-stage5__status ${statusClass(i.status)}">${esc(statusLabel(i.status))}</span></div>${i.details?`<div class="it-stage5__details">${esc(i.details)}</div>`:''}</article>`).join('')}</div><div class="it-stage5-help">Relatos são privados, passam por revisão humana e ficam vinculados ao serviço correspondente.</div></section>`;
  }

  async function renderSafety(){
    if(renderBusy)return;
    renderBusy=true;
    try{
      injectStyles();
      await fetchIncidents();
      document.getElementById('itStage5Safety')?.remove();
      decorateMatchCards();
      if(!incidents.length)return;
      const flow=document.getElementById('serviceFlow');
      if(!flow)return;
      const holder=document.createElement('div');holder.innerHTML=safetySectionHtml();
      const section=holder.firstElementChild;if(!section)return;
      const match=document.getElementById('itMatchStage1');
      if(match)match.insertAdjacentElement('afterend',section);else flow.prepend(section);
    }finally{renderBusy=false}
  }

  function activeIncidentFor(serviceId){
    return incidents.find(i=>String(i.service_id)===String(serviceId)&&['open','under_review'].includes(i.status))||null;
  }

  window.reportServiceIssue=async function(serviceId){
    await fetchIncidents();
    const active=activeIncidentFor(serviceId);
    if(active){
      if(typeof window.modal!=='function')return;
      window.modal(`<div class="notice">🛡️ Este serviço já possui um relato ativo.</div><h2>${esc(statusLabel(active.status))}</h2><p class="muted">${esc(reasonLabel(active.reason))}${active.created_at?' · '+esc(fmtDateTime(active.created_at)):''}</p>${active.details?`<div class="user-inline-note">${esc(active.details)}</div>`:''}<div class="modal-actions"><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
      return;
    }
    if(typeof window.modal!=='function')return;
    window.modal(`<div class="notice">🛡️ Relatos ficam privados e passam por revisão humana. A IntegraTrampo identifica automaticamente qual lado do serviço está enviando o relato.</div><h2>Relatar problema</h2><div class="field"><label>Motivo</label><select id="stage5Reason"><option value="no_show">No-show / ausência</option><option value="late_cancellation">Cancelamento em cima da hora</option><option value="payment_mismatch">Pagamento divergente</option><option value="unsafe_location">Local inseguro</option><option value="inappropriate_behavior">Comportamento inadequado</option><option value="fraud">Suspeita de fraude</option><option value="other">Outro</option></select></div><div class="field" style="margin-top:10px"><label>Detalhes</label><textarea id="stage5Details" maxlength="2000" placeholder="Explique o que aconteceu com clareza"></textarea></div><div class="modal-actions"><button class="btn btn--orange" id="stage5SubmitBtn" onclick="submitStage5Incident('${esc(serviceId)}')">Enviar relato</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.submitStage5Incident=async function(serviceId){
    const btn=document.getElementById('stage5SubmitBtn');
    const reason=document.getElementById('stage5Reason')?.value||'other';
    const details=document.getElementById('stage5Details')?.value.trim()||null;
    if(btn){btn.disabled=true;btn.textContent='Enviando...'}
    try{
      await rpc('it_submit_service_incident_v1',{p_service_id:serviceId,p_reason:reason,p_details:details});
      if(typeof window.closeModal==='function')window.closeModal();
      tell('Relato recebido para revisão');
      scheduleRender(80);
    }catch(e){
      console.error('[Stage5 submit]',e);
      const m=String(e?.message||e||'');
      if(m.includes('active_incident_exists'))tell('Já existe um relato ativo para este serviço.');
      else if(m.includes('service_not_accessible'))tell('Este serviço não pertence à sua conta.');
      else if(m.includes('invalid_reason'))tell('Escolha um motivo válido.');
      else tell('Não foi possível enviar o relato agora.');
      if(btn){btn.disabled=false;btn.textContent='Enviar relato'}
    }
  };

  const previousRenderPanel=window.renderPanel;
  if(typeof previousRenderPanel==='function'){
    window.renderPanel=async function(...args){
      const result=await previousRenderPanel.apply(this,args);
      scheduleRender(180);
      return result;
    };
  }

  const previousUserPanelTab=window.userPanelTab;
  if(typeof previousUserPanelTab==='function'){
    window.userPanelTab=function(...args){
      const result=previousUserPanelTab.apply(this,args);
      scheduleRender(120);
      return result;
    };
  }

  async function init(){
    injectStyles();
    await waitForSupabase();
    if(!sb)return;
    scheduleRender(250);
    try{
      sb.auth.onAuthStateChange(()=>scheduleRender(180));
    }catch{}
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.IntegraTrampoStage5Safety={version:1,get incidents(){return incidents},refresh:renderSafety};
})();
