// IntegraTrampo · Central administrativa operacional
// Login/senha são validados no Supabase. O frontend mantém apenas um token temporário de sessão.
(function(){
  const SESSION_KEY='integratrampo_admin_session_v1';
  let sb=null;
  let adminToken=null;
  let isAdmin=false;
  let adminName='Administrador';
  let initialized=false;
  let adminData=null;
  let activeSection='overview';

  const $id=id=>document.getElementById(id);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl=v=>{try{const u=new URL(String(v||''));return /^https?:$/.test(u.protocol)?u.href:''}catch{return ''}};
  const fmtDate=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(v+'T12:00:00'))}catch{return esc(v)}};
  const fmtDateTime=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat('pt-BR',{dateStyle:'short',timeStyle:'short'}).format(new Date(v))}catch{return esc(v)}};
  const money=v=>v===null||v===undefined||v===''?'A combinar':`R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
  const label=v=>({new:'Novo',under_review:'Em análise',approved:'Aprovado',rejected:'Rejeitado',suspended:'Suspenso',pending:'Pendente',received:'Recebida',confirmed:'Confirmado',requested:'Solicitado',failed:'Falhou',published:'Publicado',draft:'Rascunho',filled:'Preenchida',cancelled:'Cancelada',completed:'Concluída',matched:'Combinado',closed:'Encerrado',interested:'Interessado',selected:'Selecionado',withdrawn:'Retirado',open:'Aberto',founded:'Procedente',unfounded:'Improcedente',resolved:'Resolvido'}[v]||v||'—');
  const statusClass=v=>['approved','published','confirmed','completed','resolved','founded'].includes(v)?'status--ok':['rejected','suspended','cancelled','failed','unfounded'].includes(v)?'status--bad':'status--wait';

  function injectStyles(){
    if($id('integratrampoAdminStyles'))return;
    const s=document.createElement('style');s.id='integratrampoAdminStyles';s.textContent=`
      .admin-shell{display:grid;gap:16px}.admin-head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between;flex-wrap:wrap}
      .admin-tabs{display:flex;gap:8px;flex-wrap:wrap}.admin-tabs button{border:1px solid #d9e1ea;background:#fff;border-radius:999px;padding:10px 14px;font-weight:800;cursor:pointer;color:#0D1B2A}.admin-tabs button.is-active{background:#0D1B2A;color:#fff;border-color:#0D1B2A}
      .admin-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:12px}.admin-summary .kpi{min-height:105px}
      .admin-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:14px}.admin-card{background:#fff;border:1px solid #e2e8f0;border-radius:18px;padding:16px;box-shadow:0 8px 24px rgba(13,27,42,.05)}
      .admin-card__head{display:flex;gap:12px;align-items:flex-start;justify-content:space-between}.admin-card h3{margin:0 0 5px}.admin-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.admin-actions .btn{padding:8px 11px;font-size:13px}
      .admin-thumb{width:64px;height:64px;border-radius:14px;object-fit:cover;border:1px solid #dbe4ee;background:#f4f7fa}.admin-row{display:flex;gap:12px;align-items:flex-start}.admin-grow{flex:1;min-width:0}.admin-meta{display:flex;gap:8px;flex-wrap:wrap;margin-top:7px;font-size:13px;color:#6B7280}.admin-meta span{background:#f5f7fa;border-radius:999px;padding:5px 8px}
      .admin-toolbar{display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap}.admin-empty{padding:26px;text-align:center;background:#fff;border:1px dashed #ccd6e1;border-radius:16px;color:#6B7280}.admin-section-title{display:flex;justify-content:space-between;align-items:flex-end;gap:10px;flex-wrap:wrap;margin-top:8px}.admin-section-title h3{margin:0}.admin-audit{font-size:13px}.admin-audit .list-row{align-items:flex-start}
      .admin-alert{background:#fff7ed;border:1px solid #fed7aa;padding:12px 14px;border-radius:14px;color:#9a3412}.admin-photo-link{display:inline-flex;margin-top:6px;font-size:13px;font-weight:800}.admin-divider{height:1px;background:#e8edf3;margin:4px 0}
      @media(max-width:900px){.admin-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.admin-grid{grid-template-columns:1fr}}
      @media(max-width:520px){.admin-summary{grid-template-columns:1fr 1fr}.admin-card{padding:13px}.admin-actions .btn{flex:1}.admin-head .btn{width:100%}}
    `;document.head.appendChild(s);
  }

  function getStoredToken(){try{return sessionStorage.getItem(SESSION_KEY)||null}catch{return null}}
  function storeToken(token){try{token?sessionStorage.setItem(SESSION_KEY,token):sessionStorage.removeItem(SESSION_KEY)}catch{}}
  function setAdminState(ok,token=null,name='Administrador'){
    isAdmin=!!ok;adminToken=ok?token:null;adminName=name||'Administrador';adminData=null;
    if(ok&&token)storeToken(token);else if(!ok)storeToken(null);updateAdminUi();
  }

  function updateAdminUi(){
    const top=document.querySelector('.top-actions');let btn=$id('adminAccessBtn');
    if(top&&!btn){btn=document.createElement('button');btn.id='adminAccessBtn';btn.className='icon-btn';btn.type='button';top.insertBefore(btn,top.firstChild)}
    if(btn){btn.textContent=isAdmin?'🛡️ ADM':'🔐 ADM';btn.title=isAdmin?'Abrir central administrativa':'Entrar como administrador';btn.onclick=()=>isAdmin?openAdminArea():adminLoginModal()}
    document.querySelectorAll('[data-go="operacao"]').forEach(el=>{el.setAttribute('title',isAdmin?'Central administrativa':'Área restrita · login ADM');el.dataset.adminProtected='1'});
  }

  async function validateToken(token){
    if(!sb||!token)return false;
    try{const {data,error}=await sb.rpc('it_admin_session_valid',{p_token:token});return !error&&data===true}catch{return false}
  }

  async function rpc(name,args={}){
    if(!sb||!adminToken)throw new Error('Sessão ADM indisponível');
    const {data,error}=await sb.rpc(name,{p_token:adminToken,...args});
    if(error){
      if(String(error.message||'').includes('unauthorized')){setAdminState(false);if(typeof toast==='function')toast('Sessão ADM expirada');setTimeout(()=>adminLoginModal(),0)}
      throw error;
    }
    return data;
  }

  function friendlyError(e){
    const m=String(e?.message||e||'');
    if(m.includes('photo_required'))return 'É obrigatório receber uma foto antes de aprovar o profissional.';
    if(m.includes('approval_and_photo_required'))return 'Aprove o cadastro e a foto antes de publicar o perfil.';
    if(m.includes('company_visual_required'))return 'A empresa precisa de logo ou foto antes de ser publicada.';
    if(m.includes('published_company_required'))return 'Publique primeiro o contratante/empresa antes de publicar esta vaga.';
    if(m.includes('password_too_short'))return 'A nova senha precisa ter pelo menos 12 caracteres.';
    if(m.includes('unauthorized'))return 'Sua sessão administrativa expirou.';
    return 'Não foi possível concluir esta ação agora.';
  }

  window.adminLoginModal=function(){
    if(isAdmin){openAdminArea();return}
    modal(`<div class="notice">🛡️ <b>Área administrativa IntegraTrampo.</b> Acesso separado dos usuários comuns.</div>
      <h2>Login ADM</h2><p class="muted">Digite o login e a senha de administrador.</p>
      <div class="form-grid"><div class="field full"><label>Login</label><input id="admLogin" autocomplete="username" placeholder="admin"></div><div class="field full"><label>Senha</label><input id="admPassword" type="password" autocomplete="current-password" placeholder="••••••••••••"></div></div>
      <div class="modal-actions"><button class="btn btn--navy" id="admSubmitBtn">Entrar como ADM</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div><div id="admFeedback" class="small muted" style="margin-top:12px"></div>`);
    const login=$id('admLogin'),pass=$id('admPassword'),btn=$id('admSubmitBtn');if(login)login.focus();
    const submit=()=>adminSubmit();if(btn)btn.onclick=submit;[login,pass].forEach(el=>el&&el.addEventListener('keydown',e=>{if(e.key==='Enter')submit()}));
  };

  window.adminSubmit=async function(){
    const login=$id('admLogin')?.value?.trim()||'',password=$id('admPassword')?.value||'',btn=$id('admSubmitBtn'),feedback=$id('admFeedback');
    if(!login||!password){if(feedback)feedback.textContent='Informe login e senha.';return}
    if(!sb){if(feedback)feedback.textContent='Conexão ainda não disponível. Tente novamente em alguns segundos.';return}
    if(btn){btn.disabled=true;btn.textContent='Validando...'}
    try{
      const {data,error}=await sb.rpc('it_admin_login',{p_login:login,p_password:password});if(error)throw error;const row=Array.isArray(data)?data[0]:data;
      if(!row?.token){if(feedback)feedback.textContent='Login ou senha inválidos.';if(btn){btn.disabled=false;btn.textContent='Entrar como ADM'}return}
      setAdminState(true,row.token,row.display_name||'Administrador');closeModal();toast('Acesso administrativo liberado');openAdminArea();
    }catch(e){console.error('admin login',e);if(feedback)feedback.textContent='Não foi possível validar o acesso agora.';if(btn){btn.disabled=false;btn.textContent='Entrar como ADM'}}
  };

  window.adminLogout=async function(){
    const token=adminToken;setAdminState(false);try{if(sb&&token)await sb.rpc('it_admin_logout',{p_token:token})}catch{}
    toast('Sessão ADM encerrada');if($id('screen-operacao')?.classList.contains('is-active'))go('home');
  };

  async function loadAdminData(force=false){
    if(adminData&&!force)return adminData;
    adminData=await rpc('it_admin_dashboard_data');return adminData;
  }

  function adminHeader(){
    return `<div class="admin-head"><div><span class="eyebrow">🛡️ CENTRAL ADMINISTRATIVA</span><h2 style="margin:8px 0 4px">Operação IntegraTrampo</h2><p class="muted" style="margin:0">Aprovações, vagas, empresas, moderação e histórico operacional.</p></div><div class="admin-actions" style="margin-top:0"><button class="btn btn--outline" onclick="adminRefresh()">↻ Atualizar</button><button class="btn btn--outline" onclick="adminPasswordModal()">🔑 Alterar senha</button><button class="btn btn--navy" onclick="adminLogout()">Sair do ADM</button></div></div>
      <div class="system-note">🛡️ <b>Modo administrador ativo</b> · ${esc(adminName)} · ações administrativas ficam registradas no histórico.</div>
      <div class="admin-tabs"><button class="${activeSection==='overview'?'is-active':''}" onclick="adminSection('overview')">📊 Visão geral</button><button class="${activeSection==='professionals'?'is-active':''}" onclick="adminSection('professionals')">👥 Profissionais</button><button class="${activeSection==='jobs'?'is-active':''}" onclick="adminSection('jobs')">💼 Vagas</button><button class="${activeSection==='companies'?'is-active':''}" onclick="adminSection('companies')">🏢 Empresas</button><button class="${activeSection==='moderation'?'is-active':''}" onclick="adminSection('moderation')">🚨 Moderação</button></div>`;
  }

  function summaryHtml(c){
    const items=[[c.professionals_pending,'Cadastros a revisar'],[c.photos_pending,'Fotos pendentes'],[c.hiring_requests,'Pedidos ativos'],[c.opportunities_published,'Vagas publicadas'],[c.incidents_open,'Incidentes abertos']];
    return `<div class="admin-summary">${items.map(([n,t])=>`<article class="kpi"><strong>${Number(n||0)}</strong><span>${esc(t)}</span></article>`).join('')}</div>`;
  }

  function overviewHtml(d){
    const c=d.counts||{};
    const recent=(d.audit||[]).slice(0,10);
    return `${summaryHtml(c)}
      <div class="admin-grid">
        <article class="panel"><h3>👥 Profissionais</h3><p class="muted">${c.signups||0} cadastros recebidos · ${c.professionals_published||0} publicados.</p><button class="btn btn--green" onclick="adminSection('professionals')">Gerenciar profissionais</button></article>
        <article class="panel"><h3>💼 Vagas</h3><p class="muted">${c.hiring_requests||0} pedidos ativos · ${c.applications||0} candidaturas.</p><button class="btn btn--orange" onclick="adminSection('jobs')">Gerenciar vagas</button></article>
        <article class="panel"><h3>🏢 Empresas</h3><p class="muted">${c.companies_published||0} contratantes publicados.</p><button class="btn btn--outline" onclick="adminSection('companies')">Gerenciar empresas</button></article>
        <article class="panel"><h3>🚨 Moderação</h3><p class="muted">${c.reviews_pending||0} avaliações aguardando revisão · ${c.incidents_open||0} incidentes ativos.</p><button class="btn btn--outline" onclick="adminSection('moderation')">Abrir moderação</button></article>
      </div>
      <div class="admin-section-title"><div><h3>Atividade administrativa recente</h3><p class="muted small">Últimas ações registradas.</p></div></div>
      <div class="list admin-audit">${recent.length?recent.map(a=>`<div class="list-row"><div class="grow"><b>${esc(a.action)}</b> · ${esc(a.entity_type||'sistema')}<div class="small muted">${fmtDateTime(a.created_at)} · ${esc(a.admin_name||'Administrador')}</div></div><span class="status status--wait">registro</span></div>`).join(''):`<div class="admin-empty">Nenhuma ação administrativa registrada ainda.</div>`}</div>`;
  }

  function professionalCard(p){
    const photo=safeUrl(p.profile_photo_url);const canApprove=!!photo&&p.validation_status!=='approved';
    return `<article class="admin-card"><div class="admin-row">${photo?`<img class="admin-thumb" src="${esc(photo)}" alt="Foto de ${esc(p.full_name)}">`:`<div class="admin-thumb" style="display:grid;place-items:center;font-size:24px">👤</div>`}<div class="admin-grow"><div class="admin-card__head"><div><h3>${esc(p.full_name)}</h3><div class="small muted">${esc(p.primary_role)} · ${esc(p.city)}</div></div><span class="status ${statusClass(p.validation_status)}">${esc(label(p.validation_status))}</span></div><div class="admin-meta"><span>📱 ${esc(p.whatsapp)}</span><span>✉️ ${esc(p.email||'sem e-mail')}</span><span>📸 ${esc(label(p.photo_status))}</span><span>WhatsApp: ${esc(label(p.whatsapp_confirmation_status))}</span></div>${photo?`<a class="admin-photo-link" href="${esc(photo)}" target="_blank" rel="noopener">Ver foto em tamanho maior ↗</a>`:`<div class="small" style="margin-top:8px;color:#b45309">⚠️ Ainda sem foto. Não pode ser aprovado/publicado.</div>`}</div></div>
      <div class="admin-actions">${p.whatsapp_confirmation_status!=='confirmed'?`<button class="btn btn--outline" onclick="adminProfessionalAction('${p.id}','confirm_whatsapp')">✓ Confirmar WhatsApp</button>`:''}${canApprove?`<button class="btn btn--green" onclick="adminProfessionalAction('${p.id}','approve')">Aprovar cadastro + foto</button>`:''}${p.validation_status==='approved'&&!p.is_published?`<button class="btn btn--navy" onclick="adminProfessionalAction('${p.id}','publish')">Publicar perfil</button>`:''}${p.is_published?`<button class="btn btn--outline" onclick="adminProfessionalAction('${p.id}','unpublish')">Despublicar</button>`:''}<button class="btn btn--outline" onclick="adminProfessionalAction('${p.id}','suspend')">Suspender</button><button class="btn btn--outline" onclick="adminProfessionalAction('${p.id}','reject')">Rejeitar</button></div></article>`;
  }

  function professionalsHtml(d){
    const arr=d.professionals||[];
    return `<div class="admin-toolbar"><div><h3 style="margin:0">Profissionais</h3><p class="muted small">Foto + aprovação são obrigatórias antes da publicação.</p></div><span class="status status--wait">${arr.length} cadastro(s)</span></div>${arr.length?`<div class="admin-grid">${arr.map(professionalCard).join('')}</div>`:`<div class="admin-empty">Nenhum profissional cadastrado ainda.</div>`}`;
  }

  function hiringCard(r){
    return `<article class="admin-card"><div class="admin-card__head"><div><h3>${esc(r.category)}</h3><div class="small muted">${esc(r.requester_name)} · ${esc(r.city)}</div></div><span class="status ${statusClass(r.status)}">${esc(label(r.status))}</span></div><div class="admin-meta"><span>👥 ${Number(r.vacancies||1)} vaga(s)</span><span>📅 ${fmtDate(r.service_date)}</span><span>💰 ${money(r.daily_rate)}</span><span>📱 ${esc(r.whatsapp)}</span></div>${r.description?`<p class="small" style="margin:10px 0 0">${esc(r.description)}</p>`:''}<div class="admin-actions"><button class="btn btn--orange" onclick="adminPrepareHiring('${r.id}')">Preparar vaga</button><button class="btn btn--outline" onclick="adminHiringAction('${r.id}','review')">Em análise</button><button class="btn btn--outline" onclick="adminHiringAction('${r.id}','close')">Encerrar</button><button class="btn btn--outline" onclick="adminHiringAction('${r.id}','cancel')">Cancelar</button></div></article>`;
  }

  function opportunityCard(o){
    return `<article class="admin-card"><div class="admin-card__head"><div><h3>${esc(o.title)}</h3><div class="small muted">${esc(o.company_name||'Sem contratante')} · ${esc(o.category)}</div></div><span class="status ${statusClass(o.status)}">${esc(label(o.status))}</span></div><div class="admin-meta"><span>👥 ${Number(o.vacancies||1)} vaga(s)</span><span>📅 ${fmtDate(o.service_date)}</span><span>💰 ${money(o.daily_rate)}</span></div><div class="admin-actions"><button class="btn btn--outline" onclick="adminOpportunityModal('${o.id}')">✏️ Editar</button>${o.status!=='published'?`<button class="btn btn--green" onclick="adminOpportunityAction('${o.id}','publish')">Publicar</button>`:`<button class="btn btn--outline" onclick="adminOpportunityAction('${o.id}','draft')">Tirar do ar</button>`}<button class="btn btn--outline" onclick="adminOpportunityAction('${o.id}','filled')">Preenchida</button><button class="btn btn--outline" onclick="adminOpportunityAction('${o.id}','complete')">Concluir</button><button class="btn btn--outline" onclick="adminOpportunityAction('${o.id}','cancel')">Cancelar</button></div></article>`;
  }

  function jobsHtml(d){
    const req=d.hiring_requests||[],opps=d.opportunities||[];
    return `<div class="admin-toolbar"><div><h3 style="margin:0">Vagas e pedidos de contratação</h3><p class="muted small">Transforme pedidos recebidos em vagas e só publique com contratante validado.</p></div><button class="btn btn--orange" onclick="adminOpportunityModal(null)">+ Nova vaga</button></div>
      <div class="admin-section-title"><div><h3>Pedidos recebidos</h3><p class="muted small">Fila de necessidades enviadas pelo site.</p></div></div>${req.length?`<div class="admin-grid">${req.map(hiringCard).join('')}</div>`:`<div class="admin-empty">Nenhum pedido de contratação recebido.</div>`}
      <div class="admin-divider"></div><div class="admin-section-title"><div><h3>Vagas cadastradas</h3><p class="muted small">Rascunhos e oportunidades já publicadas.</p></div></div>${opps.length?`<div class="admin-grid">${opps.map(opportunityCard).join('')}</div>`:`<div class="admin-empty">Nenhuma vaga real cadastrada ainda.</div>`}`;
  }

  function companyCard(c){
    const logo=safeUrl(c.logo_url);
    return `<article class="admin-card"><div class="admin-row">${logo?`<img class="admin-thumb" src="${esc(logo)}" alt="Logo de ${esc(c.display_name)}">`:`<div class="admin-thumb" style="display:grid;place-items:center;font-size:24px">🏢</div>`}<div class="admin-grow"><div class="admin-card__head"><div><h3>${esc(c.display_name)}</h3><div class="small muted">${esc(c.kind||'Contratante')} · ${esc(c.city)}</div></div><span class="status ${c.is_published?'status--ok':'status--wait'}">${c.is_published?'Publicado':'Não publicado'}</span></div>${!logo?`<div class="small" style="margin-top:8px;color:#b45309">⚠️ Adicione logo/foto antes de publicar.</div>`:''}</div></div><div class="admin-actions"><button class="btn btn--outline" onclick="adminCompanyModal('${c.id}')">✏️ Editar</button>${c.is_published?`<button class="btn btn--outline" onclick="adminCompanyAction('${c.id}','hide')">Despublicar</button>`:`<button class="btn btn--green" onclick="adminCompanyAction('${c.id}','publish')">Aprovar e publicar</button>`}</div></article>`;
  }

  function companiesHtml(d){
    const arr=d.companies||[];
    return `<div class="admin-toolbar"><div><h3 style="margin:0">Empresas e contratantes</h3><p class="muted small">Identificação visual é obrigatória antes da publicação.</p></div><button class="btn btn--orange" onclick="adminCompanyModal(null)">+ Novo contratante</button></div>${arr.length?`<div class="admin-grid">${arr.map(companyCard).join('')}</div>`:`<div class="admin-empty">Nenhuma empresa real cadastrada ainda.</div>`}`;
  }

  function moderationHtml(d){
    const reviews=d.reviews||[],incidents=d.incidents||[],apps=d.applications||[],audit=d.audit||[];
    return `<div class="admin-section-title"><div><h3>Avaliações</h3><p class="muted small">Avaliações entram em moderação antes de ficarem públicas.</p></div></div>${reviews.length?`<div class="admin-grid">${reviews.map(r=>`<article class="admin-card"><div class="admin-card__head"><div><h3>${'⭐'.repeat(Math.max(1,Math.min(5,Number(r.rating||1))))}</h3><div class="small muted">${esc(r.reviewer_side)} · ${fmtDateTime(r.created_at)}</div></div><span class="status ${r.is_published?'status--ok':'status--wait'}">${r.is_published?'Publicada':'Pendente'}</span></div><p class="small">${esc(r.comment||'Sem comentário.')}</p><div class="admin-actions">${r.is_published?`<button class="btn btn--outline" onclick="adminReviewAction('${r.id}','hide')">Ocultar</button>`:`<button class="btn btn--green" onclick="adminReviewAction('${r.id}','publish')">Publicar</button>`}</div></article>`).join('')}</div>`:`<div class="admin-empty">Nenhuma avaliação para moderar.</div>`}
      <div class="admin-divider"></div><div class="admin-section-title"><div><h3>Incidentes</h3><p class="muted small">Nenhuma punição é automática: todos os relatos passam por revisão humana.</p></div></div>${incidents.length?`<div class="admin-grid">${incidents.map(i=>`<article class="admin-card"><div class="admin-card__head"><div><h3>🚨 ${esc(label(i.reason))}</h3><div class="small muted">${fmtDateTime(i.created_at)}</div></div><span class="status ${statusClass(i.status)}">${esc(label(i.status))}</span></div><p class="small">${esc(i.details||'Sem detalhes adicionais.')}</p><div class="admin-actions"><button class="btn btn--outline" onclick="adminIncidentAction('${i.id}','review')">Em análise</button><button class="btn btn--green" onclick="adminIncidentAction('${i.id}','founded')">Procedente</button><button class="btn btn--outline" onclick="adminIncidentAction('${i.id}','unfounded')">Improcedente</button><button class="btn btn--outline" onclick="adminIncidentAction('${i.id}','resolve')">Resolver</button></div></article>`).join('')}</div>`:`<div class="admin-empty">Nenhum incidente registrado.</div>`}
      <div class="admin-divider"></div><div class="admin-section-title"><div><h3>Candidaturas</h3><p class="muted small">Visão operacional das candidaturas reais.</p></div></div><div class="list">${apps.length?apps.map(a=>`<div class="list-row"><div class="grow"><b>${esc(a.professional_name||'Profissional')}</b><div class="small muted">${esc(a.opportunity_title||'Vaga')} · ${fmtDateTime(a.created_at)}</div></div><span class="status ${statusClass(a.status)}">${esc(label(a.status))}</span></div>`).join(''):`<div class="admin-empty">Nenhuma candidatura real ainda.</div>`}</div>
      <div class="admin-divider"></div><div class="admin-section-title"><div><h3>Histórico ADM</h3><p class="muted small">Trilha de auditoria das últimas ações.</p></div></div><div class="list admin-audit">${audit.length?audit.map(a=>`<div class="list-row"><div class="grow"><b>${esc(a.action)}</b> · ${esc(a.entity_type||'sistema')}<div class="small muted">${fmtDateTime(a.created_at)} · ${esc(a.admin_name||'Administrador')}</div></div><span class="status status--wait">audit</span></div>`).join(''):`<div class="admin-empty">Histórico vazio.</div>`}</div>`;
  }

  async function renderAdminDashboard(section=activeSection){
    if(!isAdmin)return adminLoginModal();activeSection=section;injectStyles();const screen=$id('screen-operacao');if(!screen)return;
    screen.innerHTML=`<div class="admin-shell"><div class="panel" style="text-align:center">Carregando central administrativa...</div></div>`;
    try{
      const d=await loadAdminData();let body=activeSection==='professionals'?professionalsHtml(d):activeSection==='jobs'?jobsHtml(d):activeSection==='companies'?companiesHtml(d):activeSection==='moderation'?moderationHtml(d):overviewHtml(d);
      screen.innerHTML=`<div class="admin-shell">${adminHeader()}${body}</div>`;
    }catch(e){console.error('admin dashboard',e);screen.innerHTML=`<div class="admin-shell">${adminHeader()}<div class="admin-alert">${esc(friendlyError(e))}</div></div>`}
  }

  window.openAdminArea=async function(){if(!isAdmin){adminLoginModal();return}go('operacao');await renderAdminDashboard(activeSection)};
  window.adminSection=async function(section){activeSection=section;await renderAdminDashboard(section)};
  window.adminRefresh=async function(){adminData=null;toast('Atualizando dados...');await renderAdminDashboard(activeSection)};

  async function action(name,args,success){
    try{await rpc(name,args);adminData=null;toast(success);await renderAdminDashboard(activeSection)}catch(e){console.error(name,e);toast(friendlyError(e))}
  }

  window.adminProfessionalAction=(id,a)=>action('it_admin_professional_action',{p_signup_id:id,p_action:a},'Cadastro atualizado');
  window.adminHiringAction=(id,a)=>action('it_admin_hiring_action',{p_request_id:id,p_action:a},'Pedido atualizado');
  window.adminCompanyAction=(id,a)=>action('it_admin_company_action',{p_company_id:id,p_action:a},'Contratante atualizado');
  window.adminOpportunityAction=(id,a)=>action('it_admin_opportunity_action',{p_opportunity_id:id,p_action:a},'Vaga atualizada');
  window.adminReviewAction=(id,a)=>action('it_admin_review_action',{p_review_id:id,p_action:a},'Avaliação atualizada');
  window.adminIncidentAction=(id,a)=>action('it_admin_incident_action',{p_incident_id:id,p_action:a},'Incidente atualizado');

  window.adminPrepareHiring=async function(id){
    if(!confirm('Preparar este pedido como rascunho de vaga?'))return;
    try{await rpc('it_admin_prepare_hiring_request',{p_request_id:id});adminData=null;activeSection='jobs';toast('Rascunho de vaga criado');await renderAdminDashboard('jobs')}catch(e){console.error(e);toast(friendlyError(e))}
  };

  window.adminCompanyModal=function(id){
    const c=(adminData?.companies||[]).find(x=>x.id===id)||null;
    modal(`<div class="notice">🏢 Empresas e contratantes só podem ficar públicos depois de possuir logo ou foto de identificação.</div><h2>${c?'Editar contratante':'Novo contratante'}</h2><div class="form-grid">
      <div class="field full"><label>Nome</label><input id="acName" value="${esc(c?.display_name||'')}"></div><div class="field"><label>Tipo</label><input id="acKind" value="${esc(c?.kind||'Empresa')}"></div><div class="field"><label>Cidade</label><input id="acCity" value="${esc(c?.city||'Teodoro Sampaio')}"></div><div class="field full"><label>Descrição</label><textarea id="acDesc">${esc(c?.description||'')}</textarea></div><div class="field full"><label>URL do logo/foto</label><input id="acLogo" type="url" value="${esc(c?.logo_url||'')}" placeholder="https://..."></div><div class="field full"><label><input id="acPublish" type="checkbox" ${c?.is_published?'checked':''}> Publicar agora</label></div></div>
      <div class="modal-actions"><button class="btn btn--green" onclick="adminSaveCompany('${c?.id||''}')">Salvar</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.adminSaveCompany=async function(id){
    const payload={p_id:id||null,p_display_name:$id('acName').value.trim(),p_kind:$id('acKind').value.trim(),p_city:$id('acCity').value.trim(),p_description:$id('acDesc').value.trim(),p_logo_url:$id('acLogo').value.trim(),p_user_id:(adminData?.companies||[]).find(x=>x.id===id)?.user_id||null,p_publish:$id('acPublish').checked};
    try{await rpc('it_admin_save_company',payload);closeModal();adminData=null;toast('Contratante salvo');await renderAdminDashboard('companies')}catch(e){console.error(e);toast(friendlyError(e))}
  };

  window.adminOpportunityModal=function(id){
    const o=(adminData?.opportunities||[]).find(x=>x.id===id)||null;const companies=adminData?.companies||[];
    modal(`<div class="notice">💼 Uma vaga só pode ser publicada quando o contratante associado já estiver aprovado e público.</div><h2>${o?'Editar vaga':'Nova vaga'}</h2><div class="form-grid">
      <div class="field full"><label>Contratante</label><select id="aoCompany"><option value="">Selecione</option>${companies.map(c=>`<option value="${c.id}" ${o?.company_id===c.id?'selected':''}>${esc(c.display_name)}${c.is_published?' · publicado':' · não publicado'}</option>`).join('')}</select></div><div class="field full"><label>Título</label><input id="aoTitle" value="${esc(o?.title||'')}"></div><div class="field"><label>Categoria</label><input id="aoCat" value="${esc(o?.category||'')}"></div><div class="field"><label>Cidade</label><input id="aoCity" value="${esc(o?.city||'Teodoro Sampaio')}"></div><div class="field"><label>Data</label><input id="aoDate" type="date" value="${esc(o?.service_date||'')}"></div><div class="field"><label>Vagas</label><input id="aoVac" type="number" min="1" value="${Number(o?.vacancies||1)}"></div><div class="field"><label>Início</label><input id="aoStart" type="time" value="${esc((o?.start_time||'').slice(0,5))}"></div><div class="field"><label>Fim</label><input id="aoEnd" type="time" value="${esc((o?.end_time||'').slice(0,5))}"></div><div class="field"><label>Diária</label><input id="aoRate" inputmode="decimal" value="${esc(o?.daily_rate??'')}"></div><div class="field"><label>Status</label><select id="aoStatus"><option value="draft" ${!o||o.status==='draft'?'selected':''}>Rascunho</option><option value="published" ${o?.status==='published'?'selected':''}>Publicada</option><option value="filled" ${o?.status==='filled'?'selected':''}>Preenchida</option><option value="cancelled" ${o?.status==='cancelled'?'selected':''}>Cancelada</option><option value="completed" ${o?.status==='completed'?'selected':''}>Concluída</option></select></div><div class="field full"><label>Descrição</label><textarea id="aoDesc">${esc(o?.description||'')}</textarea></div><div class="field full"><label>URL de imagem da vaga (opcional)</label><input id="aoImage" type="url" value="${esc(o?.image_url||'')}" placeholder="https://..."></div></div>
      <div class="modal-actions"><button class="btn btn--green" onclick="adminSaveOpportunity('${o?.id||''}')">Salvar vaga</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.adminSaveOpportunity=async function(id){
    const rate=$id('aoRate').value.trim();const payload={p_id:id||null,p_company_id:$id('aoCompany').value||null,p_title:$id('aoTitle').value.trim(),p_category:$id('aoCat').value.trim(),p_description:$id('aoDesc').value.trim(),p_city:$id('aoCity').value.trim(),p_service_date:$id('aoDate').value||null,p_start_time:$id('aoStart').value||null,p_end_time:$id('aoEnd').value||null,p_daily_rate:rate?Number(rate.replace(',','.')):null,p_vacancies:Number($id('aoVac').value||1),p_image_url:$id('aoImage').value.trim(),p_status:$id('aoStatus').value};
    try{await rpc('it_admin_save_opportunity',payload);closeModal();adminData=null;toast('Vaga salva');await renderAdminDashboard('jobs')}catch(e){console.error(e);toast(friendlyError(e))}
  };

  window.adminPasswordModal=function(){
    modal(`<div class="notice">🔑 Ao alterar a senha, todas as sessões administrativas atuais serão encerradas.</div><h2>Alterar senha ADM</h2><div class="form-grid"><div class="field full"><label>Nova senha</label><input id="apNew" type="password" autocomplete="new-password" placeholder="mínimo de 12 caracteres"></div><div class="field full"><label>Repita a nova senha</label><input id="apConfirm" type="password" autocomplete="new-password"></div></div><div class="modal-actions"><button class="btn btn--navy" onclick="adminChangePassword()">Alterar senha</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.adminChangePassword=async function(){
    const a=$id('apNew').value,b=$id('apConfirm').value;if(a.length<12){toast('Use pelo menos 12 caracteres');return}if(a!==b){toast('As senhas não coincidem');return}
    try{await rpc('it_admin_change_password',{p_new_password:a});closeModal();setAdminState(false);toast('Senha alterada. Entre novamente com a nova senha.');go('home');setTimeout(()=>adminLoginModal(),400)}catch(e){console.error(e);toast(friendlyError(e))}
  };

  // Bloqueia Operação para quem não tem sessão ADM e refresca a central para quem tem.
  document.addEventListener('click',e=>{
    const target=e.target.closest?.('[data-go="operacao"]');if(!target)return;
    if(!isAdmin){e.preventDefault();e.stopPropagation();e.stopImmediatePropagation();adminLoginModal();return}
    setTimeout(()=>renderAdminDashboard(activeSection),0);
  },true);

  async function init(){
    if(initialized)return;initialized=true;injectStyles();for(let i=0;i<80&&!window.IntegraTrampoSupabase;i++)await wait(100);sb=window.IntegraTrampoSupabase||null;
    if(!sb){console.warn('Admin: Supabase não inicializado');updateAdminUi();return}
    const token=getStoredToken();if(token&&await validateToken(token))setAdminState(true,token,'Administrador IntegraTrampo');else setAdminState(false);updateAdminUi();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
