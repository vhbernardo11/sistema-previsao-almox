// IntegraTrampo · Etapa 6 · acerto financeiro do serviço
// Registro informativo: a plataforma NÃO processa dinheiro. Contratante informa; profissional confirma ou contesta.
(function(){
  if(window.IntegraTrampoStage6Payments)return;

  let sb=null;
  let matches=[];
  let payments=[];
  let renderTimer=null;
  let renderBusy=false;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const money=v=>`R$ ${Number(v||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtDate=v=>{if(!v)return '';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return String(v)}};
  const methodLabel=v=>({pix:'PIX',cash:'Dinheiro',bank_transfer:'Transferência',other:'Outro'}[v]||v||'Não informado');
  const statusLabel=v=>({reported:'Pagamento informado',confirmed:'Recebimento confirmado',disputed:'Divergência informada'}[v]||'Pendente');
  const statusClass=v=>v==='confirmed'?'is-ok':v==='disputed'?'is-bad':'is-wait';

  function injectStyles(){
    if(document.getElementById('integratrampoStage6Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage6Styles';s.textContent=`
      .it-stage6{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#fff,#fbfcfe);padding:14px}.it-stage6__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage6__head h4{margin:0}.it-stage6__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#0D1B2A;color:#fff}.it-stage6__list{display:grid;gap:10px;margin-top:11px}.it-stage6__item{border:1px solid #e4eaf0;border-radius:15px;background:#fff;padding:12px}.it-stage6__row{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.it-stage6__item h5{margin:0;color:#0D1B2A;font-size:15px}.it-stage6__meta{font-size:12px;color:#687481;margin-top:4px}.it-stage6__amount{font-size:18px;font-weight:900;color:#0D1B2A}.it-stage6__status{display:inline-flex;align-items:center;border-radius:999px;padding:5px 8px;font-size:11px;font-weight:900}.it-stage6__status.is-ok{background:#eafaf4;color:#087858}.it-stage6__status.is-wait{background:#fff7e5;color:#8a5a00}.it-stage6__status.is-bad{background:#fff0ef;color:#a93226}.it-stage6__note{margin-top:8px;border-radius:11px;background:#f5f8fb;padding:9px 10px;font-size:12px;color:#56616c}.it-stage6__actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.it-stage6__actions .btn{padding:8px 10px;font-size:12px}.it-stage6-inline{margin-top:10px;border:1px solid #dfe6ee;border-radius:13px;background:#f9fbfd;padding:10px 11px}.it-stage6-inline .it-stage6__row{align-items:center}.it-stage6-help{font-size:12px;color:#687481;margin-top:10px}
      @media(max-width:620px){.it-stage6__actions .btn{flex:1}.it-stage6__row{align-items:stretch}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}

  async function fetchData(){
    if(!sb)await waitForSupabase();
    if(!sb){matches=[];payments=[];return}
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user){matches=[];payments=[];return}
      const [m,p]=await Promise.all([rpc('it_my_matches_v1'),rpc('it_my_service_payments_v1')]);
      matches=Array.isArray(m)?m:[];
      payments=Array.isArray(p)?p:[];
    }catch(e){console.warn('[Stage6 payments]',e);matches=[];payments=[]}
  }

  function paymentFor(serviceId){return payments.find(x=>String(x.service_id)===String(serviceId))||null}
  function matchFor(serviceId){return matches.find(x=>String(x.service_id)===String(serviceId))||null}
  function eligible(){return matches.filter(x=>x.status==='completed'&&x.completed_at)}

  function companyActions(m,p){
    if(!p)return `<button class="btn btn--green" onclick="openStage6ReportPayment('${esc(m.service_id)}')">💰 Registrar pagamento</button>`;
    if(p.status==='disputed')return `<button class="btn btn--orange" onclick="openStage6ReportPayment('${esc(m.service_id)}')">Corrigir e reenviar</button>`;
    if(p.status==='reported')return `<button class="btn btn--outline" disabled>⏳ Aguardando confirmação</button>`;
    return `<button class="btn btn--outline" disabled>✅ Pagamento encerrado</button>`;
  }

  function professionalActions(m,p){
    if(!p)return `<button class="btn btn--outline" disabled>⏳ Aguardando registro do contratante</button>`;
    if(p.status==='reported')return `<button class="btn btn--green" onclick="openStage6ConfirmPayment('${esc(m.service_id)}')">✅ Confirmar recebimento</button><button class="btn btn--outline" onclick="openStage6DisputePayment('${esc(m.service_id)}')">⚠️ Informar divergência</button>`;
    if(p.status==='disputed')return `<button class="btn btn--outline" disabled>⏳ Aguardando correção do contratante</button>`;
    return `<button class="btn btn--outline" disabled>✅ Recebimento confirmado</button>`;
  }

  function paymentCard(m){
    const p=paymentFor(m.service_id),side=m.viewer_side;
    const amount=p?money(p.amount):m.daily_rate?money(m.daily_rate):'A combinar';
    const status=p?p.status:'pending';
    return `<article class="it-stage6__item"><div class="it-stage6__row"><div><h5>${esc(m.job_title||'Serviço')}</h5><div class="it-stage6__meta">${side==='professional'?esc(m.company_name||'Contratante'):esc(m.professional_name||'Profissional')} · ${esc(m.category||'')}</div></div><div style="text-align:right"><div class="it-stage6__amount">${esc(amount)}</div><span class="it-stage6__status ${statusClass(status)}">${esc(p?statusLabel(status):'Pagamento ainda não registrado')}</span></div></div>${p?`<div class="it-stage6__meta" style="margin-top:8px">${esc(methodLabel(p.method))} · informado em ${esc(fmtDate(p.reported_at))}</div>`:''}${p?.company_note?`<div class="it-stage6__note"><b>Observação do contratante:</b> ${esc(p.company_note)}</div>`:''}${p?.professional_note?`<div class="it-stage6__note"><b>Retorno do profissional:</b> ${esc(p.professional_note)}</div>`:''}<div class="it-stage6__actions">${side==='company'?companyActions(m,p):professionalActions(m,p)}</div></article>`;
  }

  function sectionHtml(){
    const list=eligible();if(!list.length)return '';
    return `<section class="it-stage6" id="itStage6Payments"><div class="it-stage6__head"><div><h4>💰 Acerto financeiro</h4><div class="small muted">Registre e confirme pagamentos feitos fora da plataforma.</div></div><span class="it-stage6__badge">ETAPA 6</span></div><div class="it-stage6__list">${list.map(paymentCard).join('')}</div><div class="it-stage6-help">A IntegraTrampo registra a informação, mas não recebe, guarda nem transfere dinheiro nesta etapa.</div></section>`;
  }

  function decorateMatchCards(){
    document.querySelectorAll('[data-match-service]').forEach(card=>{
      card.querySelector('.it-stage6-inline')?.remove();
      const id=card.getAttribute('data-match-service'),m=matchFor(id);if(!m||m.status!=='completed')return;
      const p=paymentFor(id),box=document.createElement('div');box.className='it-stage6-inline';
      box.innerHTML=`<div class="it-stage6__row"><div><b>💰 Acerto financeiro</b><div class="it-stage6__meta">${p?`${esc(methodLabel(p.method))} · ${esc(money(p.amount))}`:'Pagamento ainda não registrado'}</div></div><span class="it-stage6__status ${statusClass(p?.status||'pending')}">${esc(p?statusLabel(p.status):'Pendente')}</span></div>`;
      const actions=card.querySelector(':scope > .it-match-actions:last-child');if(actions)actions.insertAdjacentElement('beforebegin',box);else card.appendChild(box);
    });
  }

  async function renderPayments(){
    if(renderBusy)return;renderBusy=true;
    try{
      injectStyles();await fetchData();document.getElementById('itStage6Payments')?.remove();decorateMatchCards();
      const html=sectionHtml();if(!html)return;const flow=document.getElementById('serviceFlow');if(!flow)return;
      const holder=document.createElement('div');holder.innerHTML=html;const section=holder.firstElementChild;if(!section)return;
      const stage5=document.getElementById('itStage5Safety'),match=document.getElementById('itMatchStage1');
      if(stage5)stage5.insertAdjacentElement('afterend',section);else if(match)match.insertAdjacentElement('afterend',section);else flow.prepend(section);
    }finally{renderBusy=false}
  }

  function scheduleRender(delay=140){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderPayments().catch(e=>console.warn('[Stage6 render]',e)),delay)}

  window.openStage6ReportPayment=function(serviceId){
    const m=matchFor(serviceId),p=paymentFor(serviceId);if(!m)return tell('Serviço não encontrado.');
    if(typeof window.modal!=='function')return;
    const value=p?.amount??m.daily_rate??'';
    window.modal(`<div class="notice">💰 A IntegraTrampo apenas registra o acerto. O pagamento deve ser feito diretamente entre as partes.</div><h2>${p?.status==='disputed'?'Corrigir pagamento informado':'Registrar pagamento'}</h2><p class="muted">${esc(m.job_title||'Serviço')} · ${esc(m.professional_name||'Profissional')}</p><div class="form-grid"><div class="field"><label>Valor pago</label><input id="stage6Amount" type="number" min="0.01" max="1000000" step="0.01" value="${esc(value)}" placeholder="0,00"></div><div class="field"><label>Forma de pagamento</label><select id="stage6Method"><option value="pix" ${p?.method==='pix'?'selected':''}>PIX</option><option value="cash" ${p?.method==='cash'?'selected':''}>Dinheiro</option><option value="bank_transfer" ${p?.method==='bank_transfer'?'selected':''}>Transferência</option><option value="other" ${p?.method==='other'?'selected':''}>Outro</option></select></div><div class="field full"><label>Observação (opcional)</label><textarea id="stage6CompanyNote" maxlength="500" placeholder="Ex.: PIX realizado após o término do serviço">${esc(p?.company_note||'')}</textarea></div></div><div class="modal-actions"><button class="btn btn--green" id="stage6ReportBtn" onclick="submitStage6Payment('${esc(serviceId)}')">Salvar registro</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.submitStage6Payment=async function(serviceId){
    const btn=document.getElementById('stage6ReportBtn'),amount=Number(document.getElementById('stage6Amount')?.value||0),method=document.getElementById('stage6Method')?.value||'',note=document.getElementById('stage6CompanyNote')?.value.trim()||null;
    if(!Number.isFinite(amount)||amount<=0)return tell('Informe um valor válido.');
    if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{await rpc('it_report_service_payment_v1',{p_service_id:serviceId,p_amount:amount,p_method:method,p_note:note});window.closeModal?.();tell('Pagamento registrado. Agora o profissional pode confirmar.');scheduleRender(80)}catch(e){console.error('[Stage6 report]',e);const m=String(e?.message||e||'');if(m.includes('service_not_completed'))tell('O serviço precisa estar concluído antes do acerto.');else if(m.includes('company_only_action'))tell('Somente o contratante pode registrar o pagamento.');else if(m.includes('payment_already_confirmed'))tell('Este pagamento já foi confirmado e não pode mais ser alterado.');else tell('Não foi possível registrar o pagamento agora.');if(btn){btn.disabled=false;btn.textContent='Salvar registro'}}
  };

  window.openStage6ConfirmPayment=function(serviceId){
    const p=paymentFor(serviceId),m=matchFor(serviceId);if(!p||!m)return tell('Pagamento ainda não informado.');if(typeof window.modal!=='function')return;
    window.modal(`<div class="notice">✅ Confirme somente se o valor realmente foi recebido.</div><h2>Confirmar recebimento</h2><p><b>${esc(money(p.amount))}</b> via ${esc(methodLabel(p.method))}</p><div class="field"><label>Observação (opcional)</label><textarea id="stage6ProfessionalNote" maxlength="500" placeholder="Ex.: Recebido corretamente"></textarea></div><div class="modal-actions"><button class="btn btn--green" id="stage6ConfirmBtn" onclick="submitStage6Confirmation('${esc(serviceId)}',true)">Confirmar que recebi</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.openStage6DisputePayment=function(serviceId){
    const p=paymentFor(serviceId),m=matchFor(serviceId);if(!p||!m)return tell('Pagamento ainda não informado.');if(typeof window.modal!=='function')return;
    window.modal(`<div class="notice">⚠️ Informe a divergência para que o contratante possa corrigir o registro.</div><h2>Pagamento divergente</h2><p class="muted">Informado: ${esc(money(p.amount))} via ${esc(methodLabel(p.method))}</p><div class="field"><label>O que está diferente?</label><textarea id="stage6ProfessionalNote" maxlength="500" placeholder="Ex.: recebi R$ 120,00 e o registro informa R$ 150,00"></textarea></div><div class="modal-actions"><button class="btn btn--orange" id="stage6ConfirmBtn" onclick="submitStage6Confirmation('${esc(serviceId)}',false)">Enviar divergência</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.submitStage6Confirmation=async function(serviceId,received){
    const btn=document.getElementById('stage6ConfirmBtn'),note=document.getElementById('stage6ProfessionalNote')?.value.trim()||null;
    if(!received&&(!note||note.length<3))return tell('Explique brevemente a divergência.');
    if(btn){btn.disabled=true;btn.textContent=received?'Confirmando...':'Enviando...'}
    try{await rpc('it_confirm_service_payment_v1',{p_service_id:serviceId,p_received:!!received,p_note:note});window.closeModal?.();tell(received?'Recebimento confirmado.':'Divergência enviada ao contratante.');scheduleRender(80)}catch(e){console.error('[Stage6 confirm]',e);const m=String(e?.message||e||'');if(m.includes('professional_only_action'))tell('Somente o profissional pode confirmar o recebimento.');else if(m.includes('payment_not_reported'))tell('O pagamento ainda não foi informado.');else if(m.includes('payment_needs_company_rereport'))tell('Aguarde o contratante corrigir e reenviar o registro.');else tell('Não foi possível concluir esta ação agora.');if(btn){btn.disabled=false;btn.textContent=received?'Confirmar que recebi':'Enviar divergência'}}
  };

  const previousRenderPanel=window.renderPanel;
  if(typeof previousRenderPanel==='function')window.renderPanel=async function(...args){const r=await previousRenderPanel.apply(this,args);scheduleRender(200);return r};
  const previousUserPanelTab=window.userPanelTab;
  if(typeof previousUserPanelTab==='function')window.userPanelTab=function(...args){const r=previousUserPanelTab.apply(this,args);scheduleRender(130);return r};

  async function init(){injectStyles();await waitForSupabase();if(!sb)return;scheduleRender(280);try{sb.auth.onAuthStateChange(()=>scheduleRender(180))}catch{}}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.IntegraTrampoStage6Payments={version:1,get matches(){return matches},get payments(){return payments},refresh:renderPayments};
})();
