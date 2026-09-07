// IntegraTrampo · experiência autenticada do usuário
// Perfil editável, disponibilidade, candidaturas, vagas, ciclo de serviço e notificações internas.
(function(){
  const AVATAR_BUCKET='integratrampo-avatars';
  let sb=null;
  let currentUser=null;
  let dashboard=null;
  let activeTab='profile';
  let initialized=false;
  const previousRenderPanel=window.renderPanel;

  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v===null||v===undefined||v===''?'A combinar':`R$ ${Number(v).toLocaleString('pt-BR',{maximumFractionDigits:2})}`;
  const fmtDate=v=>{if(!v)return 'A combinar';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(String(v).length===10?v+'T12:00:00':v))}catch{return esc(v)}};
  const fmtDateTime=v=>{if(!v)return '';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return esc(v)}};
  const statusLabel=v=>({
    new:'Novo',under_review:'Em análise',approved:'Aprovado',rejected:'Rejeitado',suspended:'Suspenso',pending:'Pendente',received:'Recebida',confirmed:'Confirmado',requested:'Solicitado',failed:'Falhou',
    interested:'Interesse enviado',shortlisted:'Na lista de interesse',selected:'Selecionado',declined:'Não selecionado',withdrawn:'Retirada',
    draft:'Rascunho',published:'Publicada',filled:'Preenchida',cancelled:'Cancelada',completed:'Concluída',matched:'Combinado',closed:'Encerrado',
    awaiting_confirmation:'Aguardando confirmação',open:'Aberto',founded:'Procedente',unfounded:'Improcedente',resolved:'Resolvido'
  }[v]||v||'—');
  const statusClass=v=>['approved','published','confirmed','completed','selected','resolved','founded'].includes(v)?'status--ok':['rejected','suspended','declined','cancelled','failed','unfounded'].includes(v)?'status--bad':'status--wait';
  const availabilityInfo=v=>({
    available_today:{label:'Disponível hoje',icon:'🟢',cls:'user-avail--today'},
    available_week:{label:'Disponível esta semana',icon:'🟡',cls:'user-avail--week'},
    unavailable:{label:'Indisponível',icon:'⚪',cls:'user-avail--off'}
  }[v]||{label:'Disponibilidade não informada',icon:'⚪',cls:'user-avail--off'});

  function injectStyles(){
    if($id('integratrampoUserStyles'))return;
    const s=document.createElement('style');
    s.id='integratrampoUserStyles';
    s.textContent=`
      .user-panel{display:grid;gap:14px}.user-tabs{display:flex;gap:8px;flex-wrap:wrap;margin-bottom:14px}.user-tabs button{border:1px solid #dbe3ec;background:#fff;color:#0D1B2A;border-radius:999px;padding:9px 13px;font-weight:800;cursor:pointer}.user-tabs button.is-active{background:#0D1B2A;color:#fff;border-color:#0D1B2A}
      .user-card{border:1px solid #e2e8f0;background:#fff;border-radius:16px;padding:14px;margin-bottom:10px}.user-card__head{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.user-card h4{margin:0 0 4px}.user-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.user-actions .btn{padding:8px 11px;font-size:13px}.user-meta{display:flex;gap:7px;flex-wrap:wrap;margin-top:8px}.user-meta span{background:#f4f7fa;border-radius:999px;padding:5px 8px;font-size:12px;color:#5f6b78}
      .user-progress{height:10px;background:#e7edf3;border-radius:999px;overflow:hidden;margin:8px 0 5px}.user-progress span{display:block;height:100%;background:#16B898;border-radius:999px}.user-profile-row{display:flex;gap:14px;align-items:flex-start}.user-avatar{width:82px;height:82px;border-radius:20px;object-fit:cover;background:#edf2f7;border:1px solid #d9e2ec}.user-avatar--empty{display:grid;place-items:center;font-size:30px}.user-grow{flex:1;min-width:0}
      .user-availability{display:flex;gap:7px;flex-wrap:wrap;margin-top:10px}.user-availability button{border:1px solid #d8e1ea;background:#fff;border-radius:12px;padding:8px 10px;font-weight:800;cursor:pointer}.user-availability button.is-active{box-shadow:0 0 0 2px #0D1B2A inset}.user-avail{display:inline-flex;align-items:center;gap:5px;font-size:12px;font-weight:800;border-radius:999px;padding:5px 8px}.user-avail--today{background:#e8fff6;color:#087858}.user-avail--week{background:#fff8db;color:#806000}.user-avail--off{background:#f1f4f7;color:#66717d}
      .user-notify-badge{position:absolute;right:-4px;top:-5px;min-width:18px;height:18px;padding:0 4px;border-radius:999px;background:#FF6B35;color:#fff;font-size:11px;font-weight:900;display:grid;place-items:center;border:2px solid #fff}.user-notification{display:flex;gap:10px;align-items:flex-start;padding:12px 0;border-bottom:1px solid #edf1f5}.user-notification:last-child{border-bottom:0}.user-dot{width:9px;height:9px;border-radius:50%;background:#FF6B35;margin-top:6px;flex:0 0 auto}.user-dot.is-read{background:#d8e0e8}.user-notification__body{flex:1;min-width:0}.user-notification__body b{display:block;margin-bottom:3px}
      .user-section-title{display:flex;justify-content:space-between;gap:10px;align-items:flex-end;flex-wrap:wrap;margin:4px 0 10px}.user-section-title h4{margin:0}.user-empty{border:1px dashed #ccd6e0;border-radius:15px;padding:22px;text-align:center;color:#66717d;background:#fafcfd}.user-inline-note{padding:10px 12px;border-radius:12px;background:#f5f8fb;font-size:13px;color:#5d6874;margin-top:9px}
      #notifyBtn{position:relative}.user-kpi-icon{font-size:22px}
      @media(max-width:620px){.user-profile-row{align-items:center}.user-avatar{width:68px;height:68px}.user-actions .btn{flex:1}.user-tabs{overflow-x:auto;flex-wrap:nowrap;padding-bottom:4px}.user-tabs button{white-space:nowrap}.user-card{padding:12px}}
    `;
    document.head.appendChild(s);
  }

  async function waitForSupabase(){
    for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await new Promise(r=>setTimeout(r,80));
    return window.IntegraTrampoSupabase||null;
  }

  async function refreshUser(){
    if(!sb){currentUser=null;return null}
    try{const {data}=await sb.auth.getUser();currentUser=data?.user||null}catch{currentUser=null}
    return currentUser;
  }

  async function rpc(name,args={}){
    if(!sb)throw new Error('Supabase indisponível');
    const {data,error}=await sb.rpc(name,args);
    if(error)throw error;
    return data;
  }

  function friendlyError(e){
    const m=String(e?.message||e||'');
    if(m.includes('professional_not_found'))return 'Faça primeiro seu cadastro profissional.';
    if(m.includes('company_not_found'))return 'Seu perfil de contratante ainda não está vinculado a uma empresa.';
    if(m.includes('request_not_editable'))return 'Esse pedido já avançou e não pode mais ser editado diretamente.';
    if(m.includes('opportunity_not_editable'))return 'Somente vagas em rascunho podem ser editadas por aqui.';
    if(m.includes('application_not_withdrawable'))return 'Essa candidatura não pode mais ser retirada.';
    if(m.includes('application_not_editable'))return 'Essa candidatura já foi encerrada ou não pertence à sua vaga.';
    if(m.includes('service_not_confirmed'))return 'O serviço precisa ser confirmado pelas duas partes antes da conclusão.';
    if(m.includes('service_not_accessible'))return 'Esse serviço não pertence à sua conta.';
    if(m.includes('invalid_availability'))return 'Escolha uma opção válida de disponibilidade.';
    return 'Não foi possível concluir esta ação agora.';
  }

  function updateNotifyBadge(count){
    const btn=$id('notifyBtn');if(!btn)return;
    const n=Number(count||0);
    btn.innerHTML=`🔔${n?`<span class="user-notify-badge">${n>99?'99+':n}</span>`:''}`;
    btn.setAttribute('aria-label',n?`${n} notificação(ões) não lida(s)`:'Notificações');
  }

  function setPanelHeadings(){
    const screen=$id('screen-painel');if(!screen)return;
    const p=screen.querySelector('.section-title p');if(p)p.textContent='Gerencie seu perfil, vagas, candidaturas, serviços e avisos em um só lugar.';
    const panels=screen.querySelectorAll(':scope > .panel');
    if(panels[0]?.querySelector('h3'))panels[0].querySelector('h3').textContent='Minha conta';
    if(panels[1]?.querySelector('h3'))panels[1].querySelector('h3').textContent='Notificações e segurança';
  }

  function profileCompletion(p){
    if(!p)return 0;
    const checks=[p.full_name,p.whatsapp_confirmation_status==='confirmed',p.email,p.primary_role,p.experience,Number(p.reference_daily)>0,p.availability,p.photo_status==='approved'];
    return Math.round(checks.filter(Boolean).length/checks.length*100);
  }

  function profileBlock(){
    const p=dashboard?.profile,pp=dashboard?.public_profile;
    if(!p)return `<div class="user-empty"><b>Você ainda não criou seu perfil profissional.</b><br><span class="small">Faça o pré-cadastro para começar a receber oportunidades.</span><div class="user-actions" style="justify-content:center"><button class="btn btn--green" onclick="workerModal()">Quero trabalhar</button></div></div>`;
    const completion=profileCompletion(p),av=availabilityInfo(p.availability_status);
    const photo=p.profile_photo_url||pp?.photo_url||'';
    return `<div class="user-card">
      <div class="user-profile-row">${photo?`<img class="user-avatar" src="${esc(photo)}" alt="Sua foto">`:`<div class="user-avatar user-avatar--empty">👤</div>`}<div class="user-grow">
        <div class="user-card__head"><div><h4>${esc(p.full_name)}</h4><div class="small muted">${esc(p.primary_role)} · ${esc(p.city)}</div></div><span class="status ${statusClass(p.validation_status)}">${esc(statusLabel(p.validation_status))}</span></div>
        <span class="user-avail ${av.cls}" style="margin-top:8px">${av.icon} ${av.label}</span>
        <div class="small muted" style="margin-top:10px">Perfil ${completion}% completo</div><div class="user-progress"><span style="width:${completion}%"></span></div>
      </div></div>
      <div class="user-meta"><span>📱 WhatsApp: ${esc(statusLabel(p.whatsapp_confirmation_status))}</span><span>📸 Foto: ${esc(statusLabel(p.photo_status))}</span><span>💰 ${money(p.reference_daily)}/dia</span><span>🚗 ${p.has_transport?'Com transporte':'Sem transporte'}</span></div>
      ${p.availability?`<div class="user-inline-note">🗓️ ${esc(p.availability)}</div>`:''}
      <div class="user-availability">
        ${['available_today','available_week','unavailable'].map(v=>{const x=availabilityInfo(v);return `<button class="${p.availability_status===v?'is-active':''}" onclick="setMyAvailability('${v}')">${x.icon} ${x.label}</button>`}).join('')}
      </div>
      <div class="user-actions"><button class="btn btn--navy" onclick="editMyProfile()">Editar perfil</button><button class="btn btn--outline" onclick="document.getElementById('myPhotoInput')?.click()">Trocar foto</button><input id="myPhotoInput" type="file" accept="image/jpeg,image/png,image/webp" style="display:none" onchange="uploadMyProfilePhoto(this)"></div>
      ${pp?`<div class="user-inline-note">${pp.is_published?'✅ Seu perfil está publicado para contratantes.':'⏳ Seu perfil público ainda aguarda publicação.'}</div>`:''}
    </div>`;
  }

  function applicationCard(a){
    const isPro=a.viewer_side==='professional';
    let actions='';
    if(isPro&&['interested','shortlisted'].includes(a.status))actions=`<button class="btn btn--outline" onclick="withdrawApplication('${esc(a.id)}')">Retirar candidatura</button>`;
    if(!isPro&&a.status==='interested')actions=`<button class="btn btn--outline" onclick="setApplicationStatus('${esc(a.id)}','shortlisted')">Guardar interesse</button><button class="btn btn--green" onclick="setApplicationStatus('${esc(a.id)}','selected')">Selecionar</button><button class="btn btn--outline" onclick="setApplicationStatus('${esc(a.id)}','declined')">Não selecionar</button>`;
    if(!isPro&&a.status==='shortlisted')actions=`<button class="btn btn--green" onclick="setApplicationStatus('${esc(a.id)}','selected')">Selecionar</button><button class="btn btn--outline" onclick="setApplicationStatus('${esc(a.id)}','declined')">Não selecionar</button>`;
    return `<div class="user-card"><div class="user-card__head"><div><h4>${esc(a.job_title||'Oportunidade')}</h4><div class="small muted">${isPro?esc(a.company_name):esc(a.professional_name)} · ${esc(a.category||'')}</div></div><span class="status ${statusClass(a.status)}">${esc(statusLabel(a.status))}</span></div><div class="user-meta"><span>📅 ${fmtDate(a.service_date)}</span><span>💰 ${money(a.daily_rate)}</span><span>Enviada ${fmtDate(a.created_at)}</span></div>${actions?`<div class="user-actions">${actions}</div>`:''}</div>`;
  }

  function applicationsBlock(){
    const all=dashboard?.applications||[],mine=all.filter(x=>x.viewer_side==='professional'),received=all.filter(x=>x.viewer_side==='company');
    return `<div class="user-section-title"><div><h4>Minhas candidaturas</h4><div class="small muted">Acompanhe cada etapa da seleção.</div></div></div>
      ${mine.length?mine.map(applicationCard).join(''):`<div class="user-empty">Você ainda não se candidatou a nenhuma vaga real.</div>`}
      ${received.length?`<div class="user-section-title" style="margin-top:18px"><div><h4>Candidaturas recebidas</h4><div class="small muted">Profissionais interessados nas suas vagas.</div></div></div>${received.map(applicationCard).join('')}`:''}`;
  }

  function hiringCard(h){
    const editable=['new','under_review'].includes(h.status);
    return `<div class="user-card"><div class="user-card__head"><div><h4>${esc(h.category)} · ${Number(h.vacancies||1)} vaga(s)</h4><div class="small muted">Pedido de contratação · ${fmtDate(h.created_at)}</div></div><span class="status ${statusClass(h.status)}">${esc(statusLabel(h.status))}</span></div><div class="user-meta"><span>📅 ${fmtDate(h.service_date)}</span><span>💰 ${money(h.daily_rate)}/dia</span><span>📍 ${esc(h.city)}</span></div>${editable?`<div class="user-actions"><button class="btn btn--outline" onclick="editMyHiringRequest('${esc(h.id)}')">Editar pedido</button></div>`:''}</div>`;
  }

  function opportunityCard(o){
    return `<div class="user-card"><div class="user-card__head"><div><h4>${esc(o.title)}</h4><div class="small muted">${esc(o.company_name||dashboard?.company?.display_name||'Contratante')} · ${esc(o.category)}</div></div><span class="status ${statusClass(o.status)}">${esc(statusLabel(o.status))}</span></div><div class="user-meta"><span>📅 ${fmtDate(o.service_date)}</span><span>💰 ${money(o.daily_rate)}/dia</span><span>👥 ${Number(o.vacancies||1)} vaga(s)</span></div>${o.status==='draft'?`<div class="user-actions"><button class="btn btn--navy" onclick="myOpportunityModal('${esc(o.id)}')">Editar rascunho</button></div>`:''}</div>`;
  }

  function jobsBlock(){
    const hires=dashboard?.hiring_requests||[],opps=dashboard?.opportunities||[],company=dashboard?.company;
    return `<div class="user-section-title"><div><h4>Meus pedidos de contratação</h4><div class="small muted">Pedidos enviados para a operação da IntegraTrampo.</div></div><button class="btn btn--orange" onclick="hiringModal()">Novo pedido</button></div>
      ${hires.length?hires.map(hiringCard).join(''):`<div class="user-empty">Nenhum pedido de contratação nesta conta.</div>`}
      ${company?`<div class="user-section-title" style="margin-top:18px"><div><h4>Minhas vagas</h4><div class="small muted">Rascunhos podem ser editados; a publicação continua moderada pela IntegraTrampo.</div></div><button class="btn btn--navy" onclick="myOpportunityModal()">Nova vaga</button></div>${opps.length?opps.map(opportunityCard).join(''):`<div class="user-empty">Sua empresa ainda não tem vagas criadas.</div>`}`:`<div class="user-inline-note" style="margin-top:16px">🏢 Quando seu perfil de contratante for vinculado a uma empresa, você também poderá criar e editar rascunhos de vagas diretamente.</div>`}`;
  }

  function serviceCard(s,reviews){
    const side=s.viewer_side,sideConfirmed=side==='professional'?s.professional_confirmed_at:s.company_confirmed_at,sideCompleted=side==='professional'?s.professional_completed_at:s.company_completed_at;
    const reviewed=(reviews||[]).some(r=>r.service_id===s.id);
    let actions='';
    if(s.status==='awaiting_confirmation'&&!sideConfirmed)actions+=`<button class="btn btn--green" onclick="confirmMyService('${esc(s.id)}')">Confirmar serviço</button>`;
    if(s.status==='confirmed'&&!sideCompleted)actions+=`<button class="btn btn--green" onclick="completeMyService('${esc(s.id)}')">Marcar como concluído</button>`;
    if(s.status==='completed'&&!reviewed&&typeof window.reviewService==='function')actions+=`<button class="btn btn--navy" onclick="reviewService('${esc(s.id)}','${esc(side)}')">Avaliar</button>`;
    actions+=`<button class="btn btn--outline" onclick="reportServiceIssue('${esc(s.id)}')">Relatar problema</button>`;
    return `<div class="user-card"><div class="user-card__head"><div><h4>${esc(s.job_title||'Serviço')}</h4><div class="small muted">${side==='professional'?esc(s.company_name):esc(s.professional_name)}</div></div><span class="status ${statusClass(s.status)}">${esc(statusLabel(s.status))}</span></div><div class="user-meta"><span>${sideConfirmed?'✅ Você confirmou':'⏳ Sua confirmação pendente'}</span><span>${sideCompleted?'✅ Você concluiu':'Conclusão pendente'}</span><span>Criado ${fmtDate(s.created_at)}</span></div><div class="user-actions">${actions}</div></div>`;
  }

  function servicesBlock(){
    const services=dashboard?.services||[],reviews=dashboard?.reviews||[];
    return `<div class="user-section-title"><div><h4>Meus serviços</h4><div class="small muted">Da seleção até a avaliação final.</div></div></div>${services.length?services.map(s=>serviceCard(s,reviews)).join(''):`<div class="user-empty">Nenhum serviço criado ainda. Quando um profissional for selecionado, ele aparecerá aqui.</div>`}`;
  }

  function tabBody(){
    if(activeTab==='applications')return applicationsBlock();
    if(activeTab==='jobs')return jobsBlock();
    if(activeTab==='services')return servicesBlock();
    return profileBlock();
  }

  window.userPanelTab=function(tab){
    if(!['profile','applications','jobs','services'].includes(tab))return;
    activeTab=tab;
    document.querySelectorAll('.user-tabs button').forEach(b=>b.classList.toggle('is-active',b.dataset.userTab===tab));
    const body=$id('userPanelBody');if(body)body.innerHTML=tabBody();
  };

  function notificationsSummary(){
    const notes=dashboard?.notifications||[],unread=Number(dashboard?.unread_notifications||0);
    return `<div class="list-row"><div class="grow"><b>🔔 Notificações</b><div class="small muted">${unread?`${unread} aviso(s) não lido(s)`:'Tudo em dia'}</div></div><button class="btn btn--outline" onclick="notificationModal()">Abrir</button></div>
      ${notes.slice(0,3).map(n=>`<div class="user-notification"><span class="user-dot ${n.read_at?'is-read':''}"></span><div class="user-notification__body"><b>${esc(n.title)}</b><div class="small muted">${esc(n.body||'')} ${fmtDateTime(n.created_at)?`· ${fmtDateTime(n.created_at)}`:''}</div></div></div>`).join('')}
      <div class="list-row"><div class="grow"><b>Conta conectada</b><div class="small muted">${esc(currentUser?.email||'')}</div></div><button class="btn btn--outline" onclick="signOutIntegraTrampo()">Sair</button></div>
      <div class="list-row"><div class="grow"><b>Privacidade</b><div class="small muted">Seus dados, candidaturas e serviços continuam protegidos por regras de acesso no Supabase.</div></div><span class="status status--ok">Protegido</span></div>`;
  }

  async function loadDashboard(){dashboard=await rpc('it_user_dashboard');return dashboard}

  window.renderPanel=async function(){
    if(!sb)sb=await waitForSupabase();
    await refreshUser();
    if(!currentUser){updateNotifyBadge(0);if(typeof previousRenderPanel==='function')previousRenderPanel();return}
    setPanelHeadings();
    if($id('serviceFlow'))$id('serviceFlow').innerHTML=`<div class="user-empty">Carregando sua conta...</div>`;
    if($id('candidateList'))$id('candidateList').innerHTML='';
    try{
      await loadDashboard();updateNotifyBadge(dashboard?.unread_notifications||0);
      const completion=profileCompletion(dashboard?.profile),apps=(dashboard?.applications||[]).filter(x=>x.viewer_side==='professional').length,jobs=(dashboard?.hiring_requests||[]).length+(dashboard?.opportunities||[]).length,services=(dashboard?.services||[]).length;
      $id('panelKpis').innerHTML=`<article class="kpi"><strong>${completion}%</strong><span>perfil completo</span></article><article class="kpi"><strong>${apps}</strong><span>minhas candidaturas</span></article><article class="kpi"><strong>${jobs}</strong><span>pedidos e vagas</span></article><article class="kpi"><strong>${services}</strong><span>serviços</span></article>`;
      $id('serviceFlow').innerHTML=`<div class="user-panel"><div class="user-tabs"><button data-user-tab="profile" class="${activeTab==='profile'?'is-active':''}" onclick="userPanelTab('profile')">👤 Perfil</button><button data-user-tab="applications" class="${activeTab==='applications'?'is-active':''}" onclick="userPanelTab('applications')">💼 Candidaturas</button><button data-user-tab="jobs" class="${activeTab==='jobs'?'is-active':''}" onclick="userPanelTab('jobs')">🏢 Minhas vagas</button><button data-user-tab="services" class="${activeTab==='services'?'is-active':''}" onclick="userPanelTab('services')">🤝 Serviços</button></div><div id="userPanelBody">${tabBody()}</div></div>`;
      $id('candidateList').innerHTML=notificationsSummary();
    }catch(e){console.error('user dashboard',e);$id('serviceFlow').innerHTML=`<div class="user-empty">Não foi possível carregar seu painel agora.</div>`;$id('candidateList').innerHTML=`<div class="list-row"><div class="grow"><b>Conta conectada</b><div class="small muted">${esc(currentUser.email)}</div></div><button class="btn btn--outline" onclick="signOutIntegraTrampo()">Sair</button></div>`}
  };

  window.editMyProfile=function(){
    const p=dashboard?.profile;if(!p){if(typeof workerModal==='function')workerModal();return}
    modal(`<div class="notice">👤 Você pode atualizar seus dados profissionais. Foto e aprovação continuam moderadas separadamente.</div><h2>Editar meu perfil</h2><div class="form-grid">
      <div class="field"><label>Nome</label><input id="meName" value="${esc(p.full_name)}"></div><div class="field"><label>Cidade</label><input id="meCity" value="${esc(p.city)}"></div>
      <div class="field"><label>Bairro</label><input id="meNeighborhood" value="${esc(p.neighborhood||'')}"></div><div class="field"><label>Área principal</label><input id="meRole" value="${esc(p.primary_role)}"></div>
      <div class="field"><label>Diária de referência</label><input id="meRate" inputmode="decimal" value="${p.reference_daily??''}"></div><div class="field"><label>Transporte próprio</label><select id="meTransport"><option value="false" ${!p.has_transport?'selected':''}>Não</option><option value="true" ${p.has_transport?'selected':''}>Sim</option></select></div>
      <div class="field full"><label>Disponibilidade prática</label><input id="meAvailability" value="${esc(p.availability||'')}" placeholder="Ex.: noites e fins de semana"></div>
      <div class="field full"><label>Status de disponibilidade</label><select id="meAvailabilityStatus"><option value="available_today" ${p.availability_status==='available_today'?'selected':''}>Disponível hoje</option><option value="available_week" ${p.availability_status==='available_week'?'selected':''}>Disponível esta semana</option><option value="unavailable" ${p.availability_status==='unavailable'?'selected':''}>Indisponível</option></select></div>
      <div class="field full"><label>Experiência / apresentação</label><textarea id="meExperience">${esc(p.experience||'')}</textarea></div></div>
      <div class="modal-actions"><button class="btn btn--green" id="saveMyProfileBtn" onclick="saveMyProfile()">Salvar alterações</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.saveMyProfile=async function(){
    const btn=$id('saveMyProfileBtn'),name=$id('meName')?.value.trim(),city=$id('meCity')?.value.trim(),role=$id('meRole')?.value.trim();
    if((name||'').length<2||(city||'').length<2||(role||'').length<2){toast('Preencha nome, cidade e área profissional');return}
    if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{await rpc('it_update_my_professional_profile',{p_full_name:name,p_city:city,p_neighborhood:$id('meNeighborhood')?.value.trim()||null,p_primary_role:role,p_experience:$id('meExperience')?.value.trim()||null,p_reference_daily:$id('meRate')?.value?Number($id('meRate').value.replace(',','.')):null,p_has_transport:$id('meTransport')?.value==='true',p_availability:$id('meAvailability')?.value.trim()||null,p_availability_status:$id('meAvailabilityStatus')?.value||'unavailable'});closeModal();toast('Perfil atualizado');await renderPanel();await enrichPublicAvailability()}catch(e){console.error(e);toast(friendlyError(e));if(btn){btn.disabled=false;btn.textContent='Salvar alterações'}}
  };

  window.setMyAvailability=async function(status){try{await rpc('it_update_my_availability',{p_status:status,p_availability:dashboard?.profile?.availability||null});toast(availabilityInfo(status).label);await renderPanel();await enrichPublicAvailability()}catch(e){console.error(e);toast(friendlyError(e))}};

  window.uploadMyProfilePhoto=async function(input){
    await refreshUser();const file=input?.files?.[0];if(!currentUser||!file)return;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Use JPG, PNG ou WebP');return}
    if(file.size>5*1024*1024){toast('A foto deve ter no máximo 5 MB');return}
    try{toast('Enviando foto...');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg',path=`${currentUser.id}/perfil-${Date.now()}.${ext}`;const {error}=await sb.storage.from(AVATAR_BUCKET).upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});if(error)throw error;const {data}=sb.storage.from(AVATAR_BUCKET).getPublicUrl(path);await rpc('it_update_my_photo',{p_photo_url:data.publicUrl});toast('Foto enviada para aprovação');await renderPanel()}catch(e){console.error(e);toast(friendlyError(e))}finally{if(input)input.value=''}
  };
  window.uploadProfilePhoto=async function(){const input=$id('photoFileInput');return uploadMyProfilePhoto(input)};

  window.editMyHiringRequest=function(id){
    const h=(dashboard?.hiring_requests||[]).find(x=>x.id===id);if(!h)return;
    modal(`<div class="notice">🏢 Pedidos novos ou em análise ainda podem ser ajustados.</div><h2>Editar pedido</h2><div class="form-grid">
      <div class="field"><label>Nome / empresa</label><input id="ehrName" value="${esc(h.requester_name)}"></div><div class="field"><label>WhatsApp</label><input id="ehrPhone" value="${esc(h.whatsapp)}"></div>
      <div class="field"><label>Cidade</label><input id="ehrCity" value="${esc(h.city)}"></div><div class="field"><label>Profissional</label><input id="ehrCategory" value="${esc(h.category)}"></div>
      <div class="field"><label>Vagas</label><input id="ehrVacancies" type="number" min="1" max="100" value="${Number(h.vacancies||1)}"></div><div class="field"><label>Data</label><input id="ehrDate" type="date" value="${esc(h.service_date||'')}"></div>
      <div class="field"><label>Início</label><input id="ehrStart" type="time" value="${esc((h.start_time||'').slice(0,5))}"></div><div class="field"><label>Fim</label><input id="ehrEnd" type="time" value="${esc((h.end_time||'').slice(0,5))}"></div>
      <div class="field"><label>Diária</label><input id="ehrRate" inputmode="decimal" value="${h.daily_rate??''}"></div><div class="field full"><label>Descrição</label><textarea id="ehrDescription">${esc(h.description||'')}</textarea></div></div>
      <div class="modal-actions"><button class="btn btn--green" id="saveHiringEditBtn" onclick="saveMyHiringRequest('${esc(h.id)}')">Salvar pedido</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.saveMyHiringRequest=async function(id){
    const btn=$id('saveHiringEditBtn');if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{await rpc('it_update_my_hiring_request',{p_id:id,p_requester_name:$id('ehrName').value.trim(),p_whatsapp:$id('ehrPhone').value.trim(),p_city:$id('ehrCity').value.trim(),p_category:$id('ehrCategory').value.trim(),p_vacancies:Number($id('ehrVacancies').value||1),p_service_date:$id('ehrDate').value||null,p_start_time:$id('ehrStart').value||null,p_end_time:$id('ehrEnd').value||null,p_daily_rate:$id('ehrRate').value?Number($id('ehrRate').value.replace(',','.')):null,p_description:$id('ehrDescription').value.trim()||null});closeModal();toast('Pedido atualizado');await renderPanel()}catch(e){console.error(e);toast(friendlyError(e));if(btn){btn.disabled=false;btn.textContent='Salvar pedido'}}
  };

  window.myOpportunityModal=function(id=null){
    const o=id?(dashboard?.opportunities||[]).find(x=>x.id===id):null;if(id&&!o)return;if(!dashboard?.company){toast('Seu perfil de contratante ainda não está vinculado a uma empresa');return}
    modal(`<div class="notice">💼 Você cria e edita o rascunho. A publicação continua passando pela moderação da IntegraTrampo.</div><h2>${o?'Editar vaga':'Nova vaga'}</h2><div class="form-grid">
      <div class="field full"><label>Título</label><input id="mjoTitle" value="${esc(o?.title||'')}"></div><div class="field"><label>Categoria</label><input id="mjoCategory" value="${esc(o?.category||'')}"></div><div class="field"><label>Cidade</label><input id="mjoCity" value="${esc(o?.city||dashboard.company.city||'Teodoro Sampaio')}"></div>
      <div class="field"><label>Data</label><input id="mjoDate" type="date" value="${esc(o?.service_date||'')}"></div><div class="field"><label>Vagas</label><input id="mjoVacancies" type="number" min="1" value="${Number(o?.vacancies||1)}"></div>
      <div class="field"><label>Início</label><input id="mjoStart" type="time" value="${esc((o?.start_time||'').slice(0,5))}"></div><div class="field"><label>Fim</label><input id="mjoEnd" type="time" value="${esc((o?.end_time||'').slice(0,5))}"></div>
      <div class="field"><label>Diária</label><input id="mjoRate" inputmode="decimal" value="${o?.daily_rate??''}"></div><div class="field full"><label>Descrição</label><textarea id="mjoDescription">${esc(o?.description||'')}</textarea></div></div>
      <div class="modal-actions"><button class="btn btn--green" id="saveMyOpportunityBtn" onclick="saveMyOpportunity(${o?`'${esc(o.id)}'`:'null'})">Salvar rascunho</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.saveMyOpportunity=async function(id=null){
    const btn=$id('saveMyOpportunityBtn'),args={p_title:$id('mjoTitle').value.trim(),p_category:$id('mjoCategory').value.trim(),p_description:$id('mjoDescription').value.trim()||null,p_city:$id('mjoCity').value.trim(),p_service_date:$id('mjoDate').value||null,p_start_time:$id('mjoStart').value||null,p_end_time:$id('mjoEnd').value||null,p_daily_rate:$id('mjoRate').value?Number($id('mjoRate').value.replace(',','.')):null,p_vacancies:Number($id('mjoVacancies').value||1)};
    if(args.p_title.length<2||args.p_category.length<2||args.p_city.length<2){toast('Preencha título, categoria e cidade');return}if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{if(id)await rpc('it_update_my_opportunity',{p_id:id,...args});else await rpc('it_create_my_opportunity',args);closeModal();toast('Rascunho salvo');activeTab='jobs';await renderPanel()}catch(e){console.error(e);toast(friendlyError(e));if(btn){btn.disabled=false;btn.textContent='Salvar rascunho'}}
  };

  window.withdrawApplication=async function(id){try{await rpc('it_withdraw_my_application',{p_application_id:id});toast('Candidatura retirada');activeTab='applications';await renderPanel()}catch(e){console.error(e);toast(friendlyError(e))}};

  window.setApplicationStatus=async function(id,status){
    const normalized=status==='rejected'?'declined':status;
    try{await rpc('it_company_set_application_status',{p_application_id:id,p_status:normalized});toast(normalized==='selected'?'Profissional selecionado':normalized==='shortlisted'?'Profissional guardado na lista':'Candidatura encerrada');activeTab='applications';await renderPanel()}catch(e){console.error(e);toast(friendlyError(e))}
  };

  window.confirmMyService=async function(id){try{await rpc('it_confirm_my_service',{p_service_id:id});toast('Sua confirmação foi registrada');activeTab='services';await renderPanel()}catch(e){console.error(e);toast(friendlyError(e))}};
  window.completeMyService=async function(id){try{await rpc('it_complete_my_service',{p_service_id:id});toast('Conclusão registrada');activeTab='services';await renderPanel()}catch(e){console.error(e);toast(friendlyError(e))}};

  window.reportServiceIssue=function(serviceId){
    modal(`<div class="notice">🛡️ Relatos são privados e passam por revisão humana. Nenhuma punição é automática.</div><h2>Relatar problema</h2><div class="field"><label>Motivo</label><select id="incidentReason"><option value="no_show">No-show / ausência</option><option value="late_cancellation">Cancelamento em cima da hora</option><option value="payment_mismatch">Pagamento divergente</option><option value="unsafe_location">Local inseguro</option><option value="inappropriate_behavior">Comportamento inadequado</option><option value="fraud">Suspeita de fraude</option><option value="other">Outro</option></select></div><div class="field" style="margin-top:10px"><label>Detalhes</label><textarea id="incidentDetails" placeholder="Explique o que aconteceu"></textarea></div><div class="modal-actions"><button class="btn btn--orange" onclick="submitServiceIssue('${esc(serviceId)}')">Enviar relato</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.submitServiceIssue=async function(serviceId){
    await refreshUser();if(!currentUser){loginModal();return}
    const {error}=await sb.from('it_incidents').insert({service_id:serviceId,reason:$id('incidentReason').value,details:$id('incidentDetails').value.trim()||null,status:'open',reporter_user_id:currentUser.id});
    if(error){console.error(error);toast('Não foi possível enviar o relato');return}closeModal();toast('Relato recebido para revisão');
  };

  window.notificationModal=async function(){
    await refreshUser();if(!currentUser){modal(`<div class="notice">🔔 Suas notificações ficam ligadas à sua conta.</div><h2>Notificações</h2><p class="muted">Entre por e-mail para ver seleções, novas candidaturas, aprovações e atualizações de serviço.</p><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();loginModal()">Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);return}
    try{const notes=await rpc('it_my_notifications',{p_limit:50});modal(`<div class="notice">🔔 Avisos de perfil, vagas, candidaturas, serviços e moderação ficam reunidos aqui.</div><div class="user-section-title"><div><h2 style="margin:0">Notificações</h2><div class="small muted">${(notes||[]).filter(n=>!n.read_at).length} não lida(s)</div></div><button class="btn btn--outline" onclick="markAllNotificationsRead()">Marcar todas como lidas</button></div><div style="max-height:55vh;overflow:auto">${notes?.length?notes.map(n=>`<div class="user-notification"><span class="user-dot ${n.read_at?'is-read':''}"></span><div class="user-notification__body"><b>${esc(n.title)}</b><div class="small muted">${esc(n.body||'')}</div><div class="small muted" style="margin-top:4px">${fmtDateTime(n.created_at)}</div></div>${!n.read_at?`<button class="text-btn" onclick="markNotificationRead('${esc(n.id)}')">Lida</button>`:''}</div>`).join(''):`<div class="user-empty">Nenhuma notificação ainda.</div>`}</div><div class="modal-actions"><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`)}catch(e){console.error(e);toast('Não foi possível carregar as notificações')}
  };

  window.markNotificationRead=async function(id){try{await rpc('it_mark_notification_read',{p_notification_id:id});await notificationModal();await refreshNotificationCount()}catch(e){console.error(e)}};
  window.markAllNotificationsRead=async function(){try{await rpc('it_mark_notification_read',{p_notification_id:null});toast('Notificações marcadas como lidas');await notificationModal();await refreshNotificationCount()}catch(e){console.error(e)}};

  async function refreshNotificationCount(){if(!currentUser){updateNotifyBadge(0);return}try{const d=await rpc('it_user_dashboard');dashboard=d;updateNotifyBadge(d?.unread_notifications||0)}catch{}}

  function installPublicProfessionalCard(){
    try{window.proCard=function(p){const av=availabilityInfo(p.availability_status);return `<article class="card"><div class="card__media"><img src="${esc(p.img)}" alt="Foto de ${esc(p.name)}"><span class="badge badge--green" style="position:absolute;left:12px;top:12px">PERFIL APROVADO</span></div><div class="card__body"><h3>${esc(p.name)}</h3><div class="muted small">${esc(p.role)}</div><div style="margin-top:7px"><span class="user-avail ${av.cls}">${av.icon} ${av.label}</span></div><div class="rating">⭐ ${Number(p.rating||0)} <span class="muted">(${Number(p.reviews||0)})</span></div><div class="tags">${(p.tags||[]).map(t=>`<span class="tag">${esc(t)}</span>`).join('')}</div><div class="money">${p.rate?`${money(p.rate)}/dia`:'Valor a combinar'}</div><div class="card-actions"><button class="btn btn--outline" onclick="openPro('${esc(p.id)}')">Ver perfil</button></div></div></article>`}}catch(e){console.warn('proCard override',e)}
  }

  async function enrichPublicAvailability(){
    if(!sb)return;
    try{const {data,error}=await sb.from('it_public_professionals').select('id,availability_status,availability_updated_at').eq('is_published',true);if(error)throw error;if(typeof publicPros!=='undefined'){(data||[]).forEach(row=>{const p=publicPros.find(x=>x.id===row.id);if(p){p.availability_status=row.availability_status;p.availability_updated_at=row.availability_updated_at}});if(typeof renderHome==='function')renderHome();if(typeof renderPros==='function')renderPros()}}catch(e){console.warn('availability public',e)}
  }
  window.IntegraTrampoRefreshAvailability=enrichPublicAvailability;

  async function init(){
    if(initialized)return;initialized=true;injectStyles();sb=await waitForSupabase();if(!sb)return;installPublicProfessionalCard();await refreshUser();const notify=$id('notifyBtn');if(notify)notify.onclick=()=>notificationModal();await enrichPublicAvailability();if(currentUser){await refreshNotificationCount();if($id('screen-painel')?.classList.contains('is-active'))await renderPanel()}else updateNotifyBadge(0);
    sb.auth.onAuthStateChange((event,session)=>{currentUser=session?.user||null;setTimeout(async()=>{const notifyBtn=$id('notifyBtn');if(notifyBtn)notifyBtn.onclick=()=>notificationModal();if(currentUser){await refreshNotificationCount();if($id('screen-painel')?.classList.contains('is-active'))await renderPanel()}else{dashboard=null;updateNotifyBadge(0)}},0)});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
