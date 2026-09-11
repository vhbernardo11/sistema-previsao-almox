// IntegraTrampo · Etapa 17 · aquisição, indicações e conteúdo que gera tráfego
// Coleta eventos anônimos mínimos e entrega ao ADM um painel agregado de origem/conversão.
(function(){
  if(window.IntegraTrampoStage17Analytics)return;

  const SESSION_KEY='it_analytics_session_v1';
  const ADMIN_SESSION_KEY='integratrampo_admin_session_v1';
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  let adminObserver=null;
  let shareWrapped=false;

  function tell(message){
    if(typeof window.toast==='function')window.toast(message);else console.info('[IntegraTrampo]',message);
  }

  function createUuid(){
    try{
      if(crypto?.randomUUID)return crypto.randomUUID();
      const b=new Uint8Array(16);crypto.getRandomValues(b);b[6]=(b[6]&15)|64;b[8]=(b[8]&63)|128;
      const h=[...b].map(x=>x.toString(16).padStart(2,'0')).join('');
      return `${h.slice(0,8)}-${h.slice(8,12)}-${h.slice(12,16)}-${h.slice(16,20)}-${h.slice(20)}`;
    }catch{return null}
  }

  function sessionKey(){
    try{
      const stored=sessionStorage.getItem(SESSION_KEY);if(uuid.test(stored||''))return stored;
      const next=createUuid();if(next)sessionStorage.setItem(SESSION_KEY,next);return next;
    }catch{return createUuid()}
  }

  function hostOf(value){try{return new URL(value).hostname.toLowerCase().replace(/^www\./,'')}catch{return ''}}
  function inferSource(params,referrer){
    const explicit=(params.get('utm_source')||params.get('src')||params.get('ref')||'').trim().toLowerCase();
    if(explicit)return explicit.slice(0,120);
    const host=hostOf(referrer);if(!host)return 'direct';
    if(host.includes('instagram.com'))return 'instagram';
    if(host.includes('facebook.com')||host==='fb.com')return 'facebook';
    if(host.includes('whatsapp.com')||host==='wa.me')return 'whatsapp';
    if(host.includes('linkedin.com'))return 'linkedin';
    if(host.includes('x.com')||host.includes('twitter.com'))return 'x';
    if(host.includes('google.'))return 'google';
    if(host.includes('tiktok.com'))return 'tiktok';
    return host.slice(0,120)||'referral';
  }
  function clean(value,max){const v=String(value||'').trim();return v?v.slice(0,max):null}

  function currentVisit(){
    const params=new URLSearchParams(window.location.search),referrer=document.referrer||'';
    const job=params.get('vaga'),pro=params.get('profissional');
    let entity_type=null,entity_id=null;
    if(uuid.test(job||'')){entity_type='opportunity';entity_id=job}
    else if(uuid.test(pro||'')){entity_type='professional';entity_id=pro}
    return {
      source:clean(inferSource(params,referrer),120)||'direct',
      medium:clean(params.get('utm_medium')||(referrer?'referral':'direct'),120),
      campaign:clean(params.get('utm_campaign'),180),
      channel:null,
      entity_type,entity_id,
      landing_path:clean(window.location.pathname||'/',500)||'/',
      referrer_host:clean(hostOf(referrer),180)
    };
  }

  async function client(){
    for(let i=0;i<70;i++){
      if(window.IntegraTrampoSupabase?.rpc)return window.IntegraTrampoSupabase;
      await wait(100);
    }
    return null;
  }

  async function track(eventType,extra={}){
    const key=sessionKey();if(!key)return false;
    const base=currentVisit(),payload={...base,...extra};
    try{
      const sb=await client();if(!sb)return false;
      const {data,error}=await sb.rpc('it_track_public_event_v1',{
        p_event_type:eventType,
        p_source:clean(payload.source,120)||'direct',
        p_medium:clean(payload.medium,120),
        p_campaign:clean(payload.campaign,180),
        p_channel:clean(payload.channel,32),
        p_entity_type:payload.entity_type||null,
        p_entity_id:uuid.test(payload.entity_id||'')?payload.entity_id:null,
        p_landing_path:clean(payload.landing_path,500),
        p_referrer_host:clean(payload.referrer_host,180),
        p_session_key:key
      });
      if(error)throw error;
      return data===true;
    }catch(e){console.warn('[Stage17 track]',e?.message||e);return false}
  }

  function wrapShareTracking(){
    if(shareWrapped||typeof window.stage16ShareChannel!=='function')return;
    const original=window.stage16ShareChannel;
    window.stage16ShareChannel=async function(channel){
      const pending=window.IntegraTrampoStage16Share?.pending||null;
      track('share_action',{
        channel:String(channel||'other').toLowerCase().slice(0,32),
        entity_type:pending?.type||null,
        entity_id:pending?.id||null,
        campaign:'integratrampo_stage16',
        medium:'share'
      }).catch(()=>{});
      return original.apply(this,arguments);
    };
    shareWrapped=true;
  }

  function sourceLabel(value){
    const v=String(value||'direct').toLowerCase();
    const map={direct:'Direto',whatsapp:'WhatsApp',instagram:'Instagram',facebook:'Facebook',google:'Google',tiktok:'TikTok',linkedin:'LinkedIn',x:'X / Twitter',copy:'Link copiado',native:'Compartilhamento do celular',share:'Compartilhamento'};
    return map[v]||v.replace(/[-_]/g,' ');
  }
  function channelLabel(value){
    const v=String(value||'other').toLowerCase();
    const map={whatsapp:'💬 WhatsApp',facebook:'Facebook',x:'X / Twitter',linkedin:'LinkedIn',native:'📲 Celular',copy:'🔗 Link copiado',share:'Compartilhar',other:'Outro'};
    return map[v]||v;
  }
  function fmtDay(value){
    try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit'}).format(new Date(`${value}T12:00:00`))}catch{return String(value||'')}
  }
  function fmtDateTime(value){
    try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(value))}catch{return 'agora'}
  }

  function injectStyles(){
    if(document.getElementById('integratrampoStage17Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage17Styles';s.textContent=`
      .it17-modal{max-width:880px}.it17-head{display:flex;gap:14px;justify-content:space-between;align-items:flex-start;flex-wrap:wrap}.it17-badge{font-size:10px;font-weight:900;border-radius:999px;padding:5px 8px;background:#0D1B2A;color:#fff}.it17-periods{display:flex;gap:6px;flex-wrap:wrap}.it17-periods button{border:1px solid #d8e1e8;background:#fff;border-radius:999px;padding:7px 10px;font-weight:850;cursor:pointer}.it17-periods button.is-active{background:#0D1B2A;color:#fff;border-color:#0D1B2A}.it17-kpis{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:9px;margin:14px 0}.it17-kpi{border:1px solid #e0e7ee;border-radius:15px;padding:12px;background:#fff}.it17-kpi strong{display:block;font-size:24px;color:#0D1B2A}.it17-kpi span{display:block;font-size:11px;color:#6c7782;line-height:1.3}.it17-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.it17-card{border:1px solid #e0e7ee;border-radius:16px;background:#fff;padding:13px}.it17-card h3{margin:0 0 3px}.it17-list{display:grid;gap:7px;margin-top:10px}.it17-row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;align-items:center;border-top:1px solid #eef2f5;padding-top:8px}.it17-row:first-child{border-top:0;padding-top:0}.it17-row b{font-size:13px;color:#172434}.it17-row small{color:#6c7782}.it17-number{text-align:right;font-weight:900;font-size:12px;color:#0D1B2A}.it17-trend{grid-column:1/-1}.it17-day{display:grid;grid-template-columns:48px minmax(0,1fr) auto;gap:8px;align-items:center;font-size:11px}.it17-bar{height:9px;background:#edf2f6;border-radius:999px;overflow:hidden}.it17-bar span{display:block;height:100%;background:#0D1B2A;border-radius:999px;min-width:2px}.it17-empty{padding:18px;text-align:center;color:#6c7782;background:#f8fafc;border-radius:12px}.it17-note{margin-top:11px;padding:10px 12px;background:#f5f8fb;border-radius:12px;color:#63707b;font-size:11px;line-height:1.45}.it17-admin-tab{position:relative}.it17-loading{padding:28px;text-align:center;color:#6c7782}
      @media(max-width:760px){.it17-kpis{grid-template-columns:repeat(2,minmax(0,1fr))}.it17-grid{grid-template-columns:1fr}.it17-trend{grid-column:auto}}
      @media(max-width:430px){.it17-kpis{grid-template-columns:1fr 1fr}.it17-kpi strong{font-size:20px}.it17-day{grid-template-columns:42px minmax(0,1fr) auto}}
    `;document.head.appendChild(s);
  }

  function adminToken(){try{return sessionStorage.getItem(ADMIN_SESSION_KEY)||''}catch{return ''}}

  function renderAnalytics(data,days){
    injectStyles();
    const summary=data?.summary||{},sources=Array.isArray(data?.sources)?data.sources:[],channels=Array.isArray(data?.channels)?data.channels:[],content=Array.isArray(data?.content)?data.content:[],daily=Array.isArray(data?.daily)?data.daily:[];
    const maxDay=Math.max(1,...daily.map(x=>Number(x.sessions||0)));
    const period=[7,30,90].map(n=>`<button type="button" class="${Number(days)===n?'is-active':''}" onclick="openStage17Analytics(${n})">${n} dias</button>`).join('');
    const sourceHtml=sources.length?sources.map(x=>`<div class="it17-row"><div><b>${esc(sourceLabel(x.source))}</b><br><small>${Number(x.sessions||0)} sessão(ões) · ${Number(x.professional_signups||0)} cadastros · ${Number(x.hiring_requests||0)} pedidos</small></div><div class="it17-number">${Number(x.conversions||0)} conv.</div></div>`).join(''):`<div class="it17-empty">Ainda não há origem suficiente para comparar.</div>`;
    const channelHtml=channels.length?channels.map(x=>`<div class="it17-row"><div><b>${esc(channelLabel(x.channel))}</b></div><div class="it17-number">${Number(x.clicks||0)} clique(s)</div></div>`).join(''):`<div class="it17-empty">Nenhum clique de compartilhamento registrado ainda.</div>`;
    const contentHtml=content.length?content.map(x=>`<div class="it17-row"><div><b>${x.entity_type==='opportunity'?'💼':'👤'} ${esc(x.label||'Conteúdo')}</b><br><small>${Number(x.sessions||0)} visita(s) · ${Number(x.share_clicks||0)} compartilhamento(s)</small></div><div class="it17-number">${Number(x.sessions||0)+Number(x.share_clicks||0)}</div></div>`).join(''):`<div class="it17-empty">Os conteúdos mais fortes aparecerão aqui quando os links começarem a circular.</div>`;
    const dailyHtml=daily.length?daily.slice(-31).map(x=>{const pct=Math.max(0,Math.min(100,(Number(x.sessions||0)/maxDay)*100));const conv=Number(x.professional_signups||0)+Number(x.hiring_requests||0);return `<div class="it17-day"><b>${esc(fmtDay(x.day))}</b><div class="it17-bar"><span style="width:${pct.toFixed(1)}%"></span></div><span>${Number(x.sessions||0)} visitas · ${conv} conv.</span></div>`}).join(''):`<div class="it17-empty">A série diária começa a se formar a partir de agora.</div>`;
    const started=data?.tracking_started_at?fmtDateTime(data.tracking_started_at):'agora';
    window.modal(`<div class="it17-modal"><div class="it17-head"><div><h2 style="margin:0">📈 Aquisição & indicações</h2><div class="small muted">Quem chega, por onde chega e o que realmente traz cadastro ou pedido.</div></div><div style="display:flex;gap:8px;align-items:center;flex-wrap:wrap"><span class="it17-badge">ETAPA 17</span><div class="it17-periods">${period}</div></div></div>
      <div class="it17-kpis"><div class="it17-kpi"><strong>${Number(summary.sessions||0)}</strong><span>Sessões medidas</span></div><div class="it17-kpi"><strong>${Number(summary.shared_sessions||0)}</strong><span>Chegaram por compartilhamento</span></div><div class="it17-kpi"><strong>${Number(summary.share_clicks||0)}</strong><span>Cliques em compartilhar</span></div><div class="it17-kpi"><strong>${Number(summary.conversions||0)}</strong><span>Cadastros + pedidos</span></div><div class="it17-kpi"><strong>${Number(summary.conversion_rate||0).toLocaleString('pt-BR')}%</strong><span>Conversão aproximada</span></div></div>
      <div class="it17-grid"><section class="it17-card"><h3>🧭 De onde vieram</h3><div class="small muted">Sessões e conversões agrupadas pela origem.</div><div class="it17-list">${sourceHtml}</div></section><section class="it17-card"><h3>🔗 Canais de compartilhamento</h3><div class="small muted">Cliques no botão; não significa mensagem efetivamente enviada.</div><div class="it17-list">${channelHtml}</div></section><section class="it17-card"><h3>🔥 Conteúdo que puxa tráfego</h3><div class="small muted">Vagas e profissionais com mais visitas/compartilhamentos.</div><div class="it17-list">${contentHtml}</div></section><section class="it17-card"><h3>🎯 Conversão</h3><div class="small muted">A taxa usa apenas o período em que a Etapa 17 já estava medindo visitas.</div><div class="it17-list"><div class="it17-row"><div><b>Cadastros de profissionais</b></div><div class="it17-number">${Number(summary.professional_signups||0)}</div></div><div class="it17-row"><div><b>Pedidos de contratação</b></div><div class="it17-number">${Number(summary.hiring_requests||0)}</div></div><div class="it17-row"><div><b>Início da medição</b></div><div class="it17-number">${esc(started)}</div></div></div></section><section class="it17-card it17-trend"><h3>📅 Ritmo diário</h3><div class="small muted">Visitas por sessão; cadastros e pedidos aparecem como conversões.</div><div class="it17-list">${dailyHtml}</div></section></div>
      <div class="it17-note">Privacidade: esta etapa não grava IP, e-mail, telefone, user-agent nem fingerprint. A “sessão” é uma chave aleatória temporária do navegador usada apenas para não contar o mesmo refresh várias vezes. Os números são indicadores operacionais, não auditoria contábil.</div><div class="modal-actions"><button class="btn btn--outline" type="button" onclick="closeModal()">Fechar</button></div></div>`);
  }

  window.openStage17Analytics=async function(days=30){
    const token=adminToken();
    if(!token){tell('Entre no ADM para ver aquisição e indicações.');return false}
    injectStyles();
    if(typeof window.modal==='function')window.modal(`<div class="it17-modal"><h2>📈 Aquisição & indicações</h2><div class="it17-loading">Carregando os dados da Etapa 17...</div><div class="modal-actions"><button class="btn btn--outline" type="button" onclick="closeModal()">Fechar</button></div></div>`);
    try{
      const sb=await client();if(!sb)throw new Error('Conexão indisponível');
      const safeDays=[7,30,90].includes(Number(days))?Number(days):30;
      const {data,error}=await sb.rpc('it_admin_acquisition_analytics_v1',{p_token:token,p_days:safeDays});
      if(error)throw error;
      renderAnalytics(data||{},safeDays);return true;
    }catch(e){console.error('[Stage17 analytics]',e);if(typeof window.modal==='function')window.modal(`<div class="it17-modal"><h2>📈 Aquisição & indicações</h2><div class="it17-empty">Não foi possível carregar os indicadores agora.</div><div class="modal-actions"><button class="btn btn--outline" type="button" onclick="closeModal()">Fechar</button></div></div>`);return false}
  };

  function injectAdminEntry(){
    const screen=document.getElementById('screen-operacao');if(!screen)return;
    const tabs=screen.querySelector('.admin-tabs');
    if(tabs&&!tabs.querySelector('[data-stage17-admin]')){
      const btn=document.createElement('button');btn.type='button';btn.className='it17-admin-tab';btn.dataset.stage17Admin='1';btn.textContent='📈 Aquisição';btn.onclick=()=>window.openStage17Analytics(30);tabs.appendChild(btn);
    }
    const grid=screen.querySelector('.admin-grid');
    if(grid&&!screen.querySelector('[data-stage17-overview]')){
      const card=document.createElement('article');card.className='panel';card.dataset.stage17Overview='1';card.innerHTML='<h3>📈 Aquisição & indicações</h3><p class="muted">Veja quais canais, links, vagas e profissionais estão realmente trazendo gente para o IntegraTrampo.</p><button class="btn btn--outline" type="button">Abrir indicadores</button>';card.querySelector('button').onclick=()=>window.openStage17Analytics(30);grid.appendChild(card);
    }
  }

  function observeAdmin(){
    const screen=document.getElementById('screen-operacao');if(!screen||adminObserver)return;
    adminObserver=new MutationObserver(()=>injectAdminEntry());adminObserver.observe(screen,{childList:true,subtree:true});injectAdminEntry();
  }

  window.IntegraTrampoStage17Analytics={version:17,currentVisit,track,openAdmin:window.openStage17Analytics,injectAdminEntry};
  injectStyles();
  wrapShareTracking();
  setTimeout(()=>{wrapShareTracking();observeAdmin();track('landing').catch(()=>{})},80);
  setTimeout(()=>{wrapShareTracking();observeAdmin();injectAdminEntry()},800);
})();
