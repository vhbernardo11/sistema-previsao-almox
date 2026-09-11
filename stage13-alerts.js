// IntegraTrampo · Etapa 13 · alertas inteligentes de afinidade
// Transforma recomendações fortes da Etapa 12 em avisos internos, sem push externo e sem duplicar o mesmo item.
(function(){
  if(window.IntegraTrampoStage13Alerts)return;

  let sb=null;
  let currentUser=null;
  let data={settings:{enabled:true,min_score:75,alert_opportunities:true,alert_professionals:true},alerts:[],unread:0};
  let renderTimer=null;
  let renderBusy=false;
  let modalOpen=false;
  let materializeBusy=false;
  let lastMaterializedAt=0;
  let bellTimer=null;

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const fmtDateTime=v=>{if(!v)return '';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch{return String(v)}};

  function injectStyles(){
    if(document.getElementById('integratrampoStage13Styles'))return;
    const s=document.createElement('style');
    s.id='integratrampoStage13Styles';
    s.textContent=`
      .it-stage13{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#fff9f2,#fff);padding:14px}.it-stage13__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage13__head h4{margin:0}.it-stage13__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#FF6B35;color:#fff}.it-stage13__summary{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.it-stage13__chip{display:inline-flex;align-items:center;gap:5px;border-radius:999px;background:#f3f6f8;color:#52606d;padding:6px 9px;font-size:11px;font-weight:900}.it-stage13__chip.is-on{background:#eafaf4;color:#087858}.it-stage13__chip.is-off{background:#f1f2f4;color:#6c737c}.it-stage13__chip.is-new{background:#fff0ea;color:#a74420}.it-stage13__note{margin-top:9px;border-radius:12px;background:#fff5ef;color:#79513f;padding:9px 10px;font-size:11px;line-height:1.45}.it-stage13__list{display:grid;gap:8px;margin-top:10px}.it-stage13__item{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center;border:1px solid #e5e9ee;border-radius:14px;background:#fff;padding:10px}.it-stage13__icon{width:38px;height:38px;border-radius:11px;background:#f7f3ef;display:grid;place-items:center;font-size:19px}.it-stage13__item h5{margin:0 0 3px;font-size:13px;color:#0D1B2A}.it-stage13__meta{font-size:11px;color:#687481;line-height:1.45}.it-stage13__score{font-size:11px;font-weight:900;border-radius:999px;background:#eafaf4;color:#087858;padding:5px 7px;white-space:nowrap}.it-stage13__new{display:inline-block;margin-left:5px;font-size:9px;font-weight:900;color:#b94d25}.it-stage13__actions{display:flex;gap:6px;flex-wrap:wrap}.it-stage13__actions .btn,.it-stage13__actions .text-btn{font-size:11px;padding:6px 8px}.it-stage13__foot{display:flex;gap:7px;justify-content:flex-end;flex-wrap:wrap;margin-top:10px}.it-stage13__empty{margin-top:10px;border-radius:13px;background:#f7f9fb;color:#65717d;padding:12px;font-size:12px}.it-stage13-modal{max-width:760px}.it-stage13-scroll{max-height:56vh;overflow:auto;padding-right:2px}.it-stage13-settings{display:grid;gap:12px}.it-stage13-settings label{font-size:12px;font-weight:800;color:#34404b}.it-stage13-settings input[type=number]{width:100%;padding:10px;border:1px solid #d9e0e7;border-radius:10px;margin-top:5px}.it-stage13-check{display:flex;gap:8px;align-items:flex-start}.it-stage13-activity-group{margin-top:18px;border-top:1px solid #e9edf1;padding-top:14px}
      @media(max-width:620px){.it-stage13__item{grid-template-columns:auto 1fr}.it-stage13__score{grid-column:2}.it-stage13__actions{grid-column:1/-1}.it-stage13__actions .btn{flex:1}.it-stage13__foot>.btn{flex:1}}
    `;
    document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function getUser(){if(!sb)await waitForSupabase();if(!sb)return null;try{const {data:{user}}=await sb.auth.getUser();currentUser=user||null;return currentUser}catch{currentUser=null;return null}}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}

  function normalize(raw){
    const r=raw&&typeof raw==='object'?raw:{};
    data={
      settings:{enabled:r.settings?.enabled!==false,min_score:Number(r.settings?.min_score||75),alert_opportunities:r.settings?.alert_opportunities!==false,alert_professionals:r.settings?.alert_professionals!==false,updated_at:r.settings?.updated_at||null},
      alerts:Array.isArray(r.alerts)?r.alerts:[],
      unread:Number(r.unread||0)
    };
    return data;
  }

  async function loadData(){
    const user=await getUser();
    if(!user){normalize(null);syncBell();return data}
    try{normalize(await rpc('it_my_recommendation_alerts_v1',{p_limit:40}));syncBell();return data}catch(e){console.warn('[Stage13 load]',e);return data}
  }

  async function materialize(force=false,announce=false){
    const user=await getUser();if(!user)return {created_count:0};
    const now=Date.now();
    if(!force&&now-lastMaterializedAt<120000){await loadData();return {created_count:0,throttled:true}}
    if(materializeBusy)return {created_count:0,busy:true};
    materializeBusy=true;
    try{
      const result=await rpc('it_refresh_my_recommendation_alerts_v1',{p_limit:5});
      lastMaterializedAt=Date.now();
      await loadData();
      const created=Number(result?.created_count||0);
      if(announce&&created>0)tell(`✨ ${created} novo(s) alerta(s) de afinidade.`);
      return result||{created_count:0};
    }catch(e){console.warn('[Stage13 refresh]',e);return {created_count:0,error:true}}
    finally{materializeBusy=false}
  }

  function syncBell(){
    const btn=document.getElementById('notifyBtn');if(!btn||!currentUser)return;
    const base=Number(window.IntegraTrampoStage10Activity?.data?.summary?.unread_notifications||0);
    const total=base+Number(data.unread||0);
    btn.innerHTML=`🔔${total?`<span class="user-notify-badge">${total>99?'99+':total}</span>`:''}`;
    const actions=Number(window.IntegraTrampoStage10Activity?.data?.summary?.action_required||0);
    btn.setAttribute('aria-label',`${total} aviso(s) não lido(s), ${actions} ação(ões) pendente(s)`);
  }

  function alertCard(a,compact=false){
    const isPro=a.entity_type==='professional';
    const icon=isPro?'👤':'💼';
    return `<article class="it-stage13__item"><div class="it-stage13__icon">${icon}</div><div><h5>${esc(a.title||'Alerta de afinidade')}${!a.read_at?'<span class="it-stage13__new">NOVO</span>':''}</h5><div class="it-stage13__meta">${esc(a.body||'')}</div>${!compact&&a.created_at?`<div class="it-stage13__meta">${esc(fmtDateTime(a.created_at))}</div>`:''}</div><span class="it-stage13__score">${Number(a.affinity_score||0)}/100</span>${compact?'':`<div class="it-stage13__actions"><button class="btn btn--outline" type="button" onclick="stage13OpenAlert('${esc(a.id)}','${esc(a.entity_type)}','${esc(a.entity_id)}')">${isPro?'Ver perfil':'Ver vaga'}</button>${!a.read_at?`<button class="text-btn" type="button" onclick="stage13MarkRead('${esc(a.id)}')">Marcar como lido</button>`:''}</div>`}</article>`;
  }

  function sectionHtml(){
    const s=data.settings||{},alerts=data.alerts||[],latest=alerts.slice(0,3);
    return `<section class="it-stage13" id="itStage13Alerts"><div class="it-stage13__head"><div><h4>🔔 Alertas inteligentes</h4><div class="small muted">Avisos quando as recomendações da Etapa 12 passam do seu nível de afinidade.</div></div><span class="it-stage13__badge">ETAPA 13</span></div><div class="it-stage13__summary"><span class="it-stage13__chip ${s.enabled?'is-on':'is-off'}">${s.enabled?'● Ativos':'○ Desligados'}</span><span class="it-stage13__chip">🎯 Corte: ${Number(s.min_score||75)}/100</span>${Number(data.unread||0)?`<span class="it-stage13__chip is-new">🔔 ${Number(data.unread)} novo(s)</span>`:''}</div><div class="it-stage13__note">Durante o piloto, estes alertas são internos: o sistema verifica ao entrar, voltar ao app e abrir o painel. Não é push de celular nem WhatsApp.</div>${latest.length?`<div class="it-stage13__list">${latest.map(a=>alertCard(a,true)).join('')}</div>`:`<div class="it-stage13__empty">Nenhum alerta de alta afinidade registrado ainda.</div>`}<div class="it-stage13__foot"><button class="btn btn--outline" type="button" onclick="openStage13Settings()">Configurar</button><button class="btn btn--outline" type="button" onclick="stage13RefreshNow()">Verificar agora</button><button class="btn btn--navy" type="button" onclick="openStage13Alerts()">Abrir alertas</button></div></section>`;
  }

  async function renderSection(){
    if(renderBusy)return;renderBusy=true;
    try{
      injectStyles();await materialize(false,false);document.getElementById('itStage13Alerts')?.remove();
      if(!currentUser)return;
      const flow=document.getElementById('serviceFlow');if(!flow)return;
      const holder=document.createElement('div');holder.innerHTML=sectionHtml();const section=holder.firstElementChild;if(!section)return;
      const s12=document.getElementById('itStage12Recommendations'),s11=document.getElementById('itStage11Favorites');
      if(s12)s12.insertAdjacentElement('afterend',section);else if(s11)s11.insertAdjacentElement('afterend',section);else flow.appendChild(section);
    }finally{renderBusy=false}
  }
  function scheduleRender(delay=140){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderSection().catch(e=>console.warn('[Stage13 render]',e)),delay)}

  function renderAlertsModal(){
    if(typeof window.modal!=='function')return;
    modalOpen=true;
    const alerts=data.alerts||[];
    window.modal(`<div class="it-stage13-modal"><div class="notice">🔔 <b>Alertas de afinidade.</b> O mesmo item só gera um alerta; mudar a nota depois não cria spam repetido.</div><h2>Meus alertas inteligentes</h2><div class="it-stage13-scroll">${alerts.length?`<div class="it-stage13__list">${alerts.map(a=>alertCard(a,false)).join('')}</div>`:`<div class="it-stage13__empty">Nenhum alerta registrado ainda.</div>`}</div><div class="modal-actions">${Number(data.unread||0)?'<button class="btn btn--outline" type="button" onclick="stage13MarkAllRead()">Marcar todos como lidos</button>':''}<button class="btn btn--outline" type="button" onclick="openStage13Settings()">Configurar</button><button class="btn btn--navy" type="button" onclick="stage13RefreshNow(true)">Verificar agora</button><button class="btn btn--outline" type="button" onclick="closeModal();window.IntegraTrampoStage13Alerts?.closed()">Fechar</button></div></div>`);
  }

  function renderSettingsModal(){
    if(typeof window.modal!=='function')return;
    modalOpen=true;
    const s=data.settings||{};
    window.modal(`<div class="it-stage13-modal"><div class="notice">🎯 Quanto maior o corte, menos alertas e mais seletivos eles ficam.</div><h2>Configurar alertas</h2><div class="it-stage13-settings"><label class="it-stage13-check"><input id="stage13Enabled" type="checkbox" ${s.enabled?'checked':''}><span>Ativar alertas inteligentes</span></label><label>Afinidade mínima para alertar <input id="stage13MinScore" type="number" min="50" max="100" step="5" value="${Number(s.min_score||75)}"></label><label class="it-stage13-check"><input id="stage13Jobs" type="checkbox" ${s.alert_opportunities?'checked':''}><span>Alertar vagas recomendadas</span></label><label class="it-stage13-check"><input id="stage13Pros" type="checkbox" ${s.alert_professionals?'checked':''}><span>Alertar profissionais recomendados</span></label></div><div class="modal-actions"><button class="btn btn--green" type="button" onclick="stage13SaveSettings()">Salvar</button><button class="btn btn--outline" type="button" onclick="closeModal();window.IntegraTrampoStage13Alerts?.closed()">Cancelar</button></div></div>`);
  }

  window.openStage13Alerts=async function(){
    const user=await getUser();
    if(!user){window.modal?.(`<div class="notice">🔔 Seus alertas inteligentes ficam ligados à sua conta.</div><h2>Alertas inteligentes</h2><p class="muted">Entre para receber avisos de vagas e profissionais com alta afinidade.</p><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();loginModal()">Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);return}
    await loadData();renderAlertsModal();
  };

  window.openStage13Settings=async function(){
    const user=await getUser();if(!user){tell('Entre na sua conta para configurar alertas.');return}
    await loadData();renderSettingsModal();
  };

  window.stage13SaveSettings=async function(){
    const enabled=!!document.getElementById('stage13Enabled')?.checked;
    const min=Number(document.getElementById('stage13MinScore')?.value||75);
    const jobs=!!document.getElementById('stage13Jobs')?.checked;
    const pros=!!document.getElementById('stage13Pros')?.checked;
    if(!Number.isFinite(min)||min<50||min>100){tell('Escolha uma afinidade mínima entre 50 e 100.');return}
    try{
      await rpc('it_set_my_recommendation_alert_settings_v1',{p_enabled:enabled,p_min_score:Math.round(min),p_alert_opportunities:jobs,p_alert_professionals:pros});
      if(enabled)await materialize(true,false);else await loadData();
      tell(enabled?'Alertas atualizados.':'Alertas inteligentes desligados.');
      scheduleRender(20);renderSettingsModal();
      await window.IntegraTrampoStage10Activity?.refresh?.();syncBell();
    }catch(e){console.error('[Stage13 settings]',e);tell('Não foi possível salvar as configurações agora.')}
  };

  window.stage13RefreshNow=async function(keepModal=false){
    const result=await materialize(true,true);scheduleRender(20);await window.IntegraTrampoStage10Activity?.refresh?.();syncBell();
    if(keepModal||modalOpen)renderAlertsModal();
    return result;
  };

  window.stage13MarkRead=async function(id){
    try{await rpc('it_mark_recommendation_alert_read_v1',{p_alert_id:id});await loadData();scheduleRender(20);if(modalOpen)renderAlertsModal();injectIntoActivityModal()}catch(e){console.warn('[Stage13 read]',e)}
  };
  window.stage13MarkAllRead=async function(){
    try{await rpc('it_mark_recommendation_alert_read_v1',{p_alert_id:null});await loadData();tell('Alertas de afinidade marcados como lidos.');scheduleRender(20);if(modalOpen)renderAlertsModal();injectIntoActivityModal()}catch(e){console.warn('[Stage13 read all]',e)}
  };

  window.stage13OpenAlert=async function(alertId,type,entityId){
    try{await rpc('it_mark_recommendation_alert_read_v1',{p_alert_id:alertId});await loadData()}catch{}
    try{window.closeModal?.()}catch{};modalOpen=false;scheduleRender(40);syncBell();
    if(type==='professional'){
      if(typeof window.stage12OpenProfessional==='function')setTimeout(()=>window.stage12OpenProfessional(entityId),50);
      else setTimeout(()=>window.openPro?.(entityId),50);
    }else{
      if(typeof window.stage12OpenOpportunity==='function')setTimeout(()=>window.stage12OpenOpportunity(entityId),50);
      else setTimeout(()=>window.openJob?.(entityId),50);
    }
  };

  function activityAlertHtml(a){
    const isPro=a.entity_type==='professional';
    return `<div class="it-stage10-note"><span class="it-stage10-note__dot ${a.read_at?'is-read':''}"></span><div><b>✨ ${esc(a.title||'Recomendação')}</b><div class="it-stage10-note__body">${esc(a.body||'')}</div><div class="it-stage10-note__body" style="margin-top:3px">${esc(fmtDateTime(a.created_at))}</div></div><div class="it-stage10-note__actions"><button class="btn btn--outline" type="button" onclick="stage13OpenAlert('${esc(a.id)}','${esc(a.entity_type)}','${esc(a.entity_id)}')">${isPro?'Ver perfil':'Ver vaga'}</button>${!a.read_at?`<button class="text-btn" type="button" onclick="stage13MarkRead('${esc(a.id)}')">Lida</button>`:''}</div></div>`;
  }

  function injectIntoActivityModal(){
    const modal=document.querySelector('.it-stage10-modal');if(!modal)return;
    modal.querySelector('#itStage13ActivityGroup')?.remove();
    const scroll=modal.querySelector('.it-stage10-scroll');if(!scroll)return;
    const alerts=data.alerts||[];
    const group=document.createElement('section');group.id='itStage13ActivityGroup';group.className='it-stage10-group it-stage13-activity-group';
    group.innerHTML=`<div class="it-stage10-group__head"><div><h3>✨ Alertas de afinidade</h3><div class="small muted">Vagas e profissionais que passaram do seu corte da Etapa 13.</div></div>${Number(data.unread||0)?`<button class="btn btn--outline" type="button" onclick="stage13MarkAllRead()">Marcar como lidos</button>`:''}</div>${alerts.length?alerts.slice(0,12).map(activityAlertHtml).join(''):'<div class="user-empty">Nenhum alerta de afinidade ainda.</div>'}`;
    scroll.appendChild(group);
    const stats=modal.querySelectorAll('.it-stage10-modal__hero .it-stage10-stat strong');
    if(stats.length>=4){const base=Number(window.IntegraTrampoStage10Activity?.data?.summary?.unread_notifications||0);stats[3].textContent=String(base+Number(data.unread||0))}
  }

  function wrapActivityCenter(){
    if(window.__IntegraTrampoStage13ActivityWrapped)return;
    const previousOpen=window.openStage10ActivityCenter;
    if(typeof previousOpen==='function'){
      window.openStage10ActivityCenter=async function(...args){const r=await previousOpen.apply(this,args);await loadData();setTimeout(injectIntoActivityModal,40);return r};
      window.notificationModal=window.openStage10ActivityCenter;
    }
    const previousMarkAll=window.stage10MarkAllRead;
    if(typeof previousMarkAll==='function')window.stage10MarkAllRead=async function(...args){const r=await previousMarkAll.apply(this,args);try{await rpc('it_mark_recommendation_alert_read_v1',{p_alert_id:null});await loadData()}catch{};setTimeout(injectIntoActivityModal,50);syncBell();return r};
    window.__IntegraTrampoStage13ActivityWrapped=true;
  }

  const previousRenderPanel=window.renderPanel;
  if(typeof previousRenderPanel==='function')window.renderPanel=async function(...args){const r=await previousRenderPanel.apply(this,args);scheduleRender(220);return r};
  const previousUserPanelTab=window.userPanelTab;
  if(typeof previousUserPanelTab==='function')window.userPanelTab=function(...args){const r=previousUserPanelTab.apply(this,args);scheduleRender(180);return r};

  window.IntegraTrampoStage13Alerts={
    version:13,
    refresh:async(force=false)=>{await materialize(!!force,false);scheduleRender(0);return data},
    getData:()=>data,
    open:window.openStage13Alerts,
    settings:window.openStage13Settings,
    closed:()=>{modalOpen=false;scheduleRender(30)}
  };

  async function init(){
    injectStyles();await waitForSupabase();if(!sb)return;wrapActivityCenter();
    await materialize(true,false);syncBell();
    if(document.getElementById('screen-painel')?.classList.contains('is-active'))scheduleRender(20);
    try{sb.auth.onAuthStateChange((event,session)=>{currentUser=session?.user||null;modalOpen=false;lastMaterializedAt=0;setTimeout(async()=>{if(currentUser){await materialize(true,false);scheduleRender(80)}else{normalize(null);document.getElementById('itStage13Alerts')?.remove()}syncBell()},0)})}catch{}
    window.addEventListener('focus',()=>{if(currentUser)materialize(false,false).then(()=>scheduleRender(20))});
    bellTimer=setInterval(syncBell,5000);
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',()=>init().catch(e=>console.warn('[Stage13 init]',e)),{once:true});else init().catch(e=>console.warn('[Stage13 init]',e));
})();