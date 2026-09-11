// IntegraTrampo · Etapa 10 · central inteligente de atividades
// Separa pendências reais (calculadas ao vivo) do histórico de notificações.
(function(){
  if(window.IntegraTrampoStage10Activity)return;

  let sb=null;
  let currentUser=null;
  let center={summary:{urgent:0,action_required:0,unread_messages:0,unread_notifications:0},actions:[],notifications:[]};
  let realtimeChannel=null;
  let renderTimer=null;
  let renderBusy=false;
  let modalOpen=false;

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const fmtDateTime=v=>{if(!v)return '';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch{return String(v)}};
  const priorityLabel=v=>({urgent:'Urgente',high:'Importante',normal:'Pendente',info:'Informativo'}[v]||'Pendente');
  const actionLabel=v=>({chat:'Responder',chat_context:'Abrir conversa',direct_offer:'Ver proposta',service_confirm:'Confirmar',service_complete:'Concluir',payment_report:'Registrar',payment_correct:'Corrigir',payment_confirm:'Confirmar recebimento',review:'Avaliar',application_review:'Analisar',service:'Ver serviço',jobs:'Ver vaga'}[v]||'Abrir');

  function injectStyles(){
    if(document.getElementById('integratrampoStage10Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage10Styles';s.textContent=`
      .it-stage10{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#f8fbff,#fff);padding:14px}.it-stage10__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage10__head h4{margin:0}.it-stage10__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#16B898;color:#fff}.it-stage10__summary{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.it-stage10__chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#eef3f7;color:#53606d;padding:6px 9px;font-size:11px;font-weight:900}.it-stage10__chip.is-urgent{background:#fff0ef;color:#a93226}.it-stage10__chip.is-action{background:#fff7e5;color:#8a5a00}.it-stage10__chip.is-ok{background:#eafaf4;color:#087858}.it-stage10__list{display:grid;gap:8px;margin-top:11px}.it-stage10__item{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;border:1px solid #e5eaf0;border-radius:14px;background:#fff;padding:10px}.it-stage10__icon{width:36px;height:36px;border-radius:11px;background:#f2f5f8;display:grid;place-items:center;font-size:18px}.it-stage10__item h5{margin:0 0 3px;font-size:13px;color:#0D1B2A}.it-stage10__meta{font-size:11px;color:#687481}.it-stage10__priority{font-size:10px;font-weight:900;text-transform:uppercase;letter-spacing:.03em}.it-stage10__priority.urgent{color:#b42318}.it-stage10__priority.high{color:#a15c00}.it-stage10__priority.normal{color:#52606d}.it-stage10__priority.info{color:#087858}.it-stage10__empty{margin-top:10px;border-radius:13px;background:#eafaf4;color:#087858;padding:12px;font-size:12px}.it-stage10__foot{display:flex;justify-content:flex-end;margin-top:10px}
      .it-stage10-modal{max-width:760px}.it-stage10-modal__hero{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px;margin:10px 0 16px}.it-stage10-stat{border:1px solid #e4e9ef;background:#fff;border-radius:13px;padding:10px;text-align:center}.it-stage10-stat strong{display:block;font-size:21px;color:#0D1B2A}.it-stage10-stat span{font-size:10px;color:#687481;font-weight:800}.it-stage10-group{margin-top:16px}.it-stage10-group__head{display:flex;justify-content:space-between;align-items:flex-end;gap:8px;flex-wrap:wrap;margin-bottom:8px}.it-stage10-group__head h3{margin:0}.it-stage10-note{display:grid;grid-template-columns:auto 1fr auto;gap:9px;align-items:start;padding:11px 0;border-bottom:1px solid #edf1f5}.it-stage10-note:last-child{border-bottom:0}.it-stage10-note__dot{width:9px;height:9px;border-radius:50%;background:#FF6B35;margin-top:6px}.it-stage10-note__dot.is-read{background:#d6dee6}.it-stage10-note b{display:block;font-size:13px;margin-bottom:2px}.it-stage10-note__body{font-size:12px;color:#687481}.it-stage10-note__actions{display:flex;gap:5px;flex-wrap:wrap;justify-content:flex-end}.it-stage10-note__actions .btn,.it-stage10-note__actions .text-btn{font-size:11px;padding:6px 8px}.it-stage10-scroll{max-height:54vh;overflow:auto;padding-right:2px}
      @media(max-width:620px){.it-stage10__item,.it-stage10-note{grid-template-columns:auto 1fr}.it-stage10__item>.btn,.it-stage10-note__actions{grid-column:1/-1}.it-stage10__item>.btn{width:100%}.it-stage10-note__actions{justify-content:stretch}.it-stage10-note__actions .btn{flex:1}.it-stage10-modal__hero{grid-template-columns:1fr 1fr}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function getUser(){if(!sb)await waitForSupabase();if(!sb)return null;try{const {data:{user}}=await sb.auth.getUser();currentUser=user||null;return currentUser}catch{currentUser=null;return null}}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}

  function normalizeCenter(data){
    const d=data&&typeof data==='object'?data:{};
    center={summary:{urgent:Number(d.summary?.urgent||0),action_required:Number(d.summary?.action_required||0),unread_messages:Number(d.summary?.unread_messages||0),unread_notifications:Number(d.summary?.unread_notifications||0)},actions:Array.isArray(d.actions)?d.actions:[],notifications:Array.isArray(d.notifications)?d.notifications:[],generated_at:d.generated_at||null};
    return center;
  }

  function updateBell(){
    const btn=document.getElementById('notifyBtn');if(!btn)return;
    const unread=Number(center.summary?.unread_notifications||0),actions=Number(center.summary?.action_required||0),urgent=Number(center.summary?.urgent||0);
    btn.innerHTML=`🔔${unread?`<span class="user-notify-badge">${unread>99?'99+':unread}</span>`:''}`;
    btn.setAttribute('aria-label',`${unread} aviso(s) não lido(s), ${actions} ação(ões) pendente(s)${urgent?`, ${urgent} urgente(s)`:''}`);
    btn.title=actions?`${actions} pendência(s) na Central de Atividades`:'Central de Atividades';
    btn.onclick=()=>window.openStage10ActivityCenter?.();
  }

  async function refreshCenter(){
    const user=await getUser();
    if(!user){normalizeCenter(null);updateBell();return center}
    try{const data=await rpc('it_my_activity_center_v1',{p_limit:60});normalizeCenter(data);updateBell();return center}catch(e){console.warn('[Stage10 center]',e);return center}
  }

  function actionCard(a,compact=false){
    const button=`<button class="btn ${a.priority==='urgent'?'btn--orange':'btn--outline'}" type="button" onclick="stage10DoAction('${esc(a.action_type)}','${esc(a.entity_id)}','${esc(a.viewer_side||'')}','${esc(a.entity_type||'')}')">${esc(actionLabel(a.action_type))}</button>`;
    return `<article class="it-stage10__item"><div class="it-stage10__icon">${esc(a.icon||'🔔')}</div><div><div class="it-stage10__priority ${esc(a.priority||'normal')}">${esc(priorityLabel(a.priority))}</div><h5>${esc(a.title||'Pendência')}</h5><div class="it-stage10__meta">${esc(a.body||'')}${!compact&&a.created_at?` · ${esc(fmtDateTime(a.created_at))}`:''}</div></div>${button}</article>`;
  }

  function sectionHtml(){
    const s=center.summary||{},top=(center.actions||[]).slice(0,3);
    return `<section class="it-stage10" id="itStage10Activity"><div class="it-stage10__head"><div><h4>🔔 Central de Atividades</h4><div class="small muted">O que precisa da sua atenção agora, sem misturar com avisos antigos.</div></div><span class="it-stage10__badge">ETAPA 10</span></div><div class="it-stage10__summary">${Number(s.urgent||0)?`<span class="it-stage10__chip is-urgent">🚨 ${Number(s.urgent)} urgente(s)</span>`:''}<span class="it-stage10__chip ${Number(s.action_required||0)?'is-action':'is-ok'}">${Number(s.action_required||0)?'⏳':'✅'} ${Number(s.action_required||0)} ação(ões)</span><span class="it-stage10__chip">💬 ${Number(s.unread_messages||0)} mensagem(ns)</span><span class="it-stage10__chip">🔔 ${Number(s.unread_notifications||0)} aviso(s)</span></div>${top.length?`<div class="it-stage10__list">${top.map(a=>actionCard(a,true)).join('')}</div>`:`<div class="it-stage10__empty">✅ Nenhuma ação pendente. Seu fluxo está em dia.</div>`}<div class="it-stage10__foot"><button class="btn btn--navy" type="button" onclick="openStage10ActivityCenter()">Abrir central completa</button></div></section>`;
  }

  async function renderSection(){
    if(renderBusy)return;renderBusy=true;
    try{
      injectStyles();await refreshCenter();document.getElementById('itStage10Activity')?.remove();
      const user=currentUser,flow=document.getElementById('serviceFlow');if(!user||!flow)return;
      const holder=document.createElement('div');holder.innerHTML=sectionHtml();const section=holder.firstElementChild;if(!section)return;
      const s9=document.getElementById('itStage9Chat'),s8=document.getElementById('itStage8Schedule'),s7=document.getElementById('itStage7DirectHiring');
      if(s9)s9.insertAdjacentElement('afterend',section);else if(s8)s8.insertAdjacentElement('afterend',section);else if(s7)s7.insertAdjacentElement('afterend',section);else flow.prepend(section);
    }finally{renderBusy=false}
  }
  function scheduleRender(delay=120){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderSection().catch(e=>console.warn('[Stage10 render]',e)),delay)}

  function notificationActionButton(n){
    if(!n||!n.action_type||n.action_type==='none'||!n.entity_id)return '';
    return `<button class="btn btn--outline" type="button" onclick="stage10DoAction('${esc(n.action_type)}','${esc(n.entity_id)}','','${esc(n.entity_type||'')}')">${esc(actionLabel(n.action_type))}</button>`;
  }

  function renderModal(){
    if(typeof window.modal!=='function')return;
    modalOpen=true;
    const s=center.summary||{},actions=center.actions||[],notes=center.notifications||[];
    const actionHtml=actions.length?`<div class="it-stage10__list">${actions.map(a=>actionCard(a,false)).join('')}</div>`:`<div class="it-stage10__empty">✅ Nenhuma ação pendente neste momento.</div>`;
    const noteHtml=notes.length?notes.map(n=>`<div class="it-stage10-note"><span class="it-stage10-note__dot ${n.read_at?'is-read':''}"></span><div><b>${esc(n.icon||'🔔')} ${esc(n.title||'Atualização')}</b><div class="it-stage10-note__body">${esc(n.body||'')}</div><div class="it-stage10-note__body" style="margin-top:3px">${esc(fmtDateTime(n.created_at))}</div></div><div class="it-stage10-note__actions">${notificationActionButton(n)}${!n.read_at?`<button class="text-btn" type="button" onclick="stage10MarkRead('${esc(n.id)}')">Lida</button>`:''}</div></div>`).join(''):`<div class="user-empty">Nenhuma atualização registrada ainda.</div>`;
    window.modal(`<div class="it-stage10-modal"><div class="notice">🔔 A central separa <b>pendências reais</b> de <b>avisos já ocorridos</b>. Resolver uma pendência em qualquer tela faz ela desaparecer automaticamente daqui.</div><div class="it-stage10-modal__hero"><div class="it-stage10-stat"><strong>${Number(s.urgent||0)}</strong><span>URGENTES</span></div><div class="it-stage10-stat"><strong>${Number(s.action_required||0)}</strong><span>AÇÕES</span></div><div class="it-stage10-stat"><strong>${Number(s.unread_messages||0)}</strong><span>MENSAGENS</span></div><div class="it-stage10-stat"><strong>${Number(s.unread_notifications||0)}</strong><span>AVISOS NOVOS</span></div></div><div class="it-stage10-scroll"><section class="it-stage10-group"><div class="it-stage10-group__head"><div><h3>Faça agora</h3><div class="small muted">Ordenado por urgência e momento do serviço.</div></div></div>${actionHtml}</section><section class="it-stage10-group"><div class="it-stage10-group__head"><div><h3>Atualizações</h3><div class="small muted">Histórico de mensagens, propostas, candidaturas, pagamentos e moderação.</div></div>${Number(s.unread_notifications||0)?`<button class="btn btn--outline" type="button" onclick="stage10MarkAllRead()">Marcar avisos como lidos</button>`:''}</div>${noteHtml}</section></div><div class="modal-actions"><button class="btn btn--outline" type="button" onclick="closeModal();window.IntegraTrampoStage10Activity?.closed()">Fechar</button></div></div>`);
  }

  window.openStage10ActivityCenter=async function(){
    const user=await getUser();
    if(!user){if(typeof window.modal==='function')window.modal(`<div class="notice">🔔 Sua Central de Atividades fica ligada à sua conta.</div><h2>Central de Atividades</h2><p class="muted">Entre para ver mensagens, propostas, candidaturas, confirmações, pagamentos e avaliações pendentes.</p><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();loginModal()">Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);return}
    try{await refreshCenter();renderModal()}catch(e){console.error('[Stage10 modal]',e);tell('Não foi possível carregar a Central de Atividades agora.')}
  };
  window.notificationModal=window.openStage10ActivityCenter;

  window.stage10MarkRead=async function(id){
    try{await rpc('it_mark_notification_read',{p_notification_id:id});await refreshCenter();renderModal();scheduleRender(40)}catch(e){console.warn('[Stage10 mark read]',e)}
  };
  window.stage10MarkAllRead=async function(){
    try{await rpc('it_mark_notification_read',{p_notification_id:null});tell('Avisos marcados como lidos.');await refreshCenter();renderModal();scheduleRender(40)}catch(e){console.warn('[Stage10 mark all]',e)}
  };

  function focusService(id){
    try{window.go?.('painel');window.userPanelTab?.('services')}catch{}
    setTimeout(()=>{const el=document.querySelector(`[data-match-service="${CSS.escape(String(id))}"]`);if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.animate?.([{outline:'3px solid #16B898'},{outline:'0 solid transparent'}],{duration:1600})}},240);
  }
  function focusOffer(id){
    try{window.go?.('painel')}catch{}
    setTimeout(()=>{const offers=window.IntegraTrampoStage7DirectHiring?.offers||[],idx=offers.findIndex(o=>String(o.id)===String(id)),cards=document.querySelectorAll('#itStage7DirectHiring .it-stage7__item'),el=idx>=0?cards[idx]:null;if(el){el.scrollIntoView({behavior:'smooth',block:'center'});el.animate?.([{outline:'3px solid #FF6B35'},{outline:'0 solid transparent'}],{duration:1600})}},260);
  }

  window.stage10DoAction=function(type,id,viewerSide,entityType){
    try{window.closeModal?.()}catch{};modalOpen=false;
    if(type==='chat'){setTimeout(()=>window.openStage9Thread?.(id),60);return}
    if(type==='chat_context'){setTimeout(()=>window.openStage9Chat?.(entityType,id),60);return}
    if(type==='direct_offer'){focusOffer(id);return}
    if(type==='service_confirm'||type==='service_complete'||type==='service'){focusService(id);return}
    if(type==='payment_report'||type==='payment_correct'){setTimeout(()=>window.openStage6ReportPayment?.(id),60);return}
    if(type==='payment_confirm'){setTimeout(()=>window.openStage6ConfirmPayment?.(id),60);return}
    if(type==='review'){setTimeout(()=>{if(typeof window.reviewService==='function')window.reviewService(id,viewerSide);else focusService(id)},60);return}
    if(type==='application_review'){try{window.go?.('painel');window.userPanelTab?.('applications')}catch{};return}
    if(type==='jobs'){try{window.go?.('painel');window.userPanelTab?.('jobs')}catch{};return}
    try{window.go?.('painel')}catch{}
  };

  async function setupRealtime(){
    if(!sb)await waitForSupabase();if(!sb)return;
    if(realtimeChannel){try{await sb.removeChannel(realtimeChannel)}catch{};realtimeChannel=null}
    const user=await getUser();if(!user)return;
    try{
      realtimeChannel=sb.channel(`integratrampo-activity-${user.id}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'it_notifications',filter:`user_id=eq.${user.id}`},()=>{
          setTimeout(async()=>{await refreshCenter();scheduleRender(20);if(modalOpen&&document.querySelector('.it-stage10-modal'))renderModal()},40);
        }).subscribe();
    }catch(e){console.warn('[Stage10 realtime]',e);realtimeChannel=null}
  }

  const previousRenderPanel=window.renderPanel;
  if(typeof previousRenderPanel==='function')window.renderPanel=async function(...args){const r=await previousRenderPanel.apply(this,args);scheduleRender(220);return r};
  const previousUserPanelTab=window.userPanelTab;
  if(typeof previousUserPanelTab==='function')window.userPanelTab=function(...args){const r=previousUserPanelTab.apply(this,args);scheduleRender(180);return r};

  window.IntegraTrampoStage10Activity={
    refresh:async()=>{await refreshCenter();scheduleRender(20);return center},
    get data(){return center},
    closed(){modalOpen=false}
  };

  async function init(){
    injectStyles();await waitForSupabase();if(!sb)return;await refreshCenter();updateBell();await setupRealtime();
    const btn=document.getElementById('notifyBtn');if(btn)btn.onclick=()=>window.openStage10ActivityCenter();
    if(currentUser&&document.getElementById('screen-painel')?.classList.contains('is-active'))scheduleRender(180);
    sb.auth.onAuthStateChange((event,session)=>{currentUser=session?.user||null;setTimeout(async()=>{await refreshCenter();updateBell();await setupRealtime();if(currentUser)scheduleRender(100);else document.getElementById('itStage10Activity')?.remove()},0)});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();