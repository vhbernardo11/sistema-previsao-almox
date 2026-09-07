// IntegraTrampo · Auth, painel privado, foto e candidaturas reais
// Carregado depois de app.js, tracking.js e samples.js para evoluir o piloto
// sem quebrar a vitrine pública e os exemplos de demonstração.
(async function(){
  let sb=null, currentSession=null, currentUser=null, claimedUserId=null;
  const AVATAR_BUCKET='integratrampo-avatars';
  const previousOpenJob=window.openJob;

  const esc=v=>String(v??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
  const fmtDate=v=>{if(!v)return '—';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(v))}catch{return v}};
  const statusLabel=v=>({new:'Novo',pending:'Pendente',approved:'Aprovado',rejected:'Rejeitado',interested:'Interesse enviado',selected:'Selecionado',withdrawn:'Retirado',awaiting_confirmation:'Aguardando confirmação',completed:'Concluído',open:'Em análise'}[v]||v||'—');
  const isEmail=v=>/^\S+@\S+\.\S+$/.test(v||'');

  function acquisitionFields(){
    const a=window.IntegraTrampoAcquisition||{};
    return {
      acquisition_source:a.acquisition_source||'direct',
      acquisition_medium:a.acquisition_medium||null,
      acquisition_campaign:a.acquisition_campaign||null,
      acquisition_content:a.acquisition_content||null,
      acquisition_term:a.acquisition_term||null,
      referrer_url:a.referrer_url||document.referrer||null,
      landing_path:a.landing_path||window.location.pathname
    };
  }

  function updateLoginButton(){
    const b=$('loginBtn'); if(!b)return;
    if(currentUser){b.textContent='Minha conta';b.onclick=()=>go('painel')}
    else {b.textContent='Entrar';b.onclick=()=>loginModal()}
  }

  async function claimRecords(){
    if(!currentUser||claimedUserId===currentUser.id)return;
    try{await sb.rpc('it_claim_my_records');claimedUserId=currentUser.id}catch(e){console.warn('claim',e)}
  }

  function loginHtml(){
    return `<div class="notice">🔐 Acesso sem senha: a IntegraTrampo envia um link seguro para seu e-mail.</div>
      <h2>Entrar na IntegraTrampo</h2>
      <p class="muted">Use o mesmo e-mail informado no cadastro para acessar seu painel, foto, candidaturas e serviços.</p>
      <div class="field"><label>E-mail</label><input id="authEmail" type="email" autocomplete="email" placeholder="voce@exemplo.com"></div>
      <div class="modal-actions"><button class="btn btn--navy" id="sendMagicLinkBtn">Enviar link de acesso</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>
      <div id="authFeedback" class="small muted" style="margin-top:12px"></div>`;
  }

  window.loginModal=function(){
    if(currentUser){go('painel');return}
    modal(loginHtml());
    const input=$('authEmail'),btn=$('sendMagicLinkBtn');
    btn.onclick=async()=>{
      const email=input.value.trim().toLowerCase();
      if(!isEmail(email)){toast('Informe um e-mail válido');return}
      btn.disabled=true;btn.textContent='Enviando...';
      const redirectTo=window.location.origin+window.location.pathname;
      const {error}=await sb.auth.signInWithOtp({email,options:{emailRedirectTo:redirectTo,shouldCreateUser:true}});
      if(error){
        console.error(error);$('authFeedback').textContent='Não foi possível enviar o link: '+error.message;btn.disabled=false;btn.textContent='Enviar link de acesso';return;
      }
      $('authFeedback').innerHTML='✅ Link enviado. Abra seu e-mail e toque no link para entrar. Você pode fechar esta janela.';
      btn.textContent='Link enviado';
    };
  };

  window.signOutIntegraTrampo=async function(){
    await sb.auth.signOut();currentSession=null;currentUser=null;claimedUserId=null;updateLoginButton();toast('Você saiu da sua conta');go('home');
  };

  window.workerModal=function(){
    const email=currentUser?.email||'';
    modal(`<div class="notice">👤 Seu pré-cadastro real será salvo com segurança no Supabase.</div>
      <div class="notice">📸 <b>Foto obrigatória para ativação.</b> Depois do cadastro, entre no painel pelo e-mail para enviar a foto. O perfil só fica público após aprovação.</div>
      <h2>Quero trabalhar</h2><div class="form-grid">
      <div class="field"><label>Nome completo</label><input id="wName" placeholder="Seu nome"></div>
      <div class="field"><label>WhatsApp</label><input id="wPhone" inputmode="tel" placeholder="(18) 99999-9999"></div>
      <div class="field full"><label>E-mail para acessar o painel</label><input id="wEmail" type="email" value="${esc(email)}" ${currentUser?'readonly':''} placeholder="voce@exemplo.com"></div>
      <div class="field"><label>Área principal</label><select id="wRole"><option>Garçom</option><option>Barman</option><option>Auxiliar de cozinha</option><option>Churrasqueiro</option><option>Diarista</option><option>Limpeza</option><option>Recepção</option></select></div>
      <div class="field"><label>Cidade</label><input id="wCity" value="Teodoro Sampaio"></div>
      <div class="field"><label>Diária de referência</label><input id="wRate" inputmode="decimal" placeholder="150"></div>
      <div class="field"><label>Transporte próprio</label><select id="wTransport"><option value="false">Não</option><option value="true">Sim</option></select></div>
      <div class="field full"><label>Disponibilidade</label><input id="wAvailability" placeholder="Ex.: noites e fins de semana"></div>
      <div class="field full"><label>Experiência</label><textarea id="wExperience" placeholder="Conte rapidamente sua experiência"></textarea></div></div>
      <div class="modal-actions"><button class="btn btn--green" id="saveWorkerBtn" onclick="saveWorker()">Salvar e confirmar WhatsApp</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.saveWorker=async function(){
    const btn=$('saveWorkerBtn'),name=$('wName').value.trim(),phone=$('wPhone').value.trim(),email=$('wEmail').value.trim().toLowerCase(),city=$('wCity').value.trim()||'Teodoro Sampaio',role=$('wRole').value;
    if(name.length<2||phone.replace(/\D/g,'').length<10){toast('Preencha nome e WhatsApp corretamente');return}
    if(!isEmail(email)){toast('Informe um e-mail válido para acessar seu painel');return}
    btn.disabled=true;btn.textContent='Salvando...';
    try{
      const payload={full_name:name,whatsapp:phone,email,city,primary_role:role,experience:$('wExperience').value.trim()||null,reference_daily:$('wRate').value?Number($('wRate').value.replace(',','.')):null,has_transport:$('wTransport').value==='true',availability:$('wAvailability').value.trim()||null,whatsapp_confirmation_status:'pending',validation_status:'new',photo_status:'pending',source:'vercel_free_stack',user_id:currentUser?.id||null,...acquisitionFields()};
      const {error}=await sb.from('it_professional_signups').insert(payload);if(error)throw error;
      await loadMetrics();
      const msg=encodeURIComponent(`👋 Olá! Fiz meu pré-cadastro na *IntegraTrampo* e quero confirmar meu WhatsApp.\n\n👤 *Nome:* ${name}\n📱 *WhatsApp:* ${phone}\n📍 *Cidade:* ${city}\n💼 *Área:* ${role}\n\n✅ Quero validar meu cadastro.\n📸 Sei que a foto é obrigatória e vou enviá-la pelo meu painel.`);
      closeModal();toast('Cadastro recebido');window.open(`https://wa.me/${WA_NUMBER}?text=${msg}`,'_blank');
      if(currentUser){await claimRecords();go('painel')}
    }catch(e){console.error(e);toast('Não foi possível salvar agora');btn.disabled=false;btn.textContent='Salvar e confirmar WhatsApp'}
  };

  window.hiringModal=function(){
    const email=currentUser?.email||'';
    modal(`<div class="notice">🏢 Seu pedido real será salvo com segurança no Supabase.</div><h2>Preciso contratar</h2><div class="form-grid">
      <div class="field"><label>Empresa ou seu nome</label><input id="hName"></div><div class="field"><label>WhatsApp</label><input id="hPhone" inputmode="tel"></div>
      <div class="field full"><label>E-mail para acompanhar pelo painel</label><input id="hEmail" type="email" value="${esc(email)}" ${currentUser?'readonly':''} placeholder="voce@exemplo.com"></div>
      <div class="field"><label>Tipo</label><select id="hType"><option value="company">Empresa</option><option value="person">Pessoa física</option></select></div><div class="field"><label>Cidade</label><input id="hCity" value="Teodoro Sampaio"></div>
      <div class="field"><label>Profissional necessário</label><select id="hCat"><option>Garçom</option><option>Barman</option><option>Auxiliar de cozinha</option><option>Churrasqueiro</option><option>Limpeza</option><option>Recepção</option></select></div><div class="field"><label>Vagas</label><input id="hVac" type="number" min="1" value="1"></div>
      <div class="field"><label>Data</label><input id="hDate" type="date"></div><div class="field"><label>Valor por diária</label><input id="hRate" inputmode="decimal"></div>
      <div class="field full"><label>Descrição</label><textarea id="hDesc" placeholder="Conte o que você precisa"></textarea></div></div>
      <div class="modal-actions"><button class="btn btn--orange" id="saveHireBtn" onclick="saveHiring()">Enviar necessidade</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.saveHiring=async function(){
    const btn=$('saveHireBtn'),name=$('hName').value.trim(),phone=$('hPhone').value.trim(),email=$('hEmail').value.trim().toLowerCase();
    if(name.length<2||phone.replace(/\D/g,'').length<10){toast('Preencha nome e WhatsApp corretamente');return}
    if(!isEmail(email)){toast('Informe um e-mail válido para acompanhar seu pedido');return}
    btn.disabled=true;btn.textContent='Enviando...';
    try{
      const payload={requester_name:name,whatsapp:phone,email,requester_type:$('hType').value,city:$('hCity').value.trim()||'Teodoro Sampaio',category:$('hCat').value,vacancies:Number($('hVac').value||1),service_date:$('hDate').value||null,daily_rate:$('hRate').value?Number($('hRate').value.replace(',','.')):null,description:$('hDesc').value.trim()||null,status:'new',source:'vercel_free_stack',user_id:currentUser?.id||null,...acquisitionFields()};
      const {error}=await sb.from('it_hiring_requests').insert(payload);if(error)throw error;
      await loadMetrics();closeModal();toast('Pedido recebido pela IntegraTrampo');if(currentUser){await claimRecords();go('painel')}
    }catch(e){console.error(e);toast('Não foi possível enviar agora');btn.disabled=false;btn.textContent='Enviar necessidade'}
  };

  window.uploadProfilePhoto=async function(){
    if(!currentUser){loginModal();return}
    const input=$('photoFileInput'),btn=$('uploadPhotoBtn'),file=input?.files?.[0];
    if(!file){toast('Escolha uma foto');return}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Use JPG, PNG ou WebP');return}
    if(file.size>5*1024*1024){toast('A foto deve ter no máximo 5 MB');return}
    btn.disabled=true;btn.textContent='Enviando foto...';
    try{
      const {data:signups,error:sErr}=await sb.from('it_professional_signups').select('id').order('created_at',{ascending:false}).limit(1);if(sErr)throw sErr;
      const signup=signups?.[0];if(!signup){toast('Faça primeiro seu pré-cadastro profissional');btn.disabled=false;btn.textContent='Enviar foto';return}
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
      const path=`${currentUser.id}/perfil-${Date.now()}.${ext}`;
      const {error:uErr}=await sb.storage.from(AVATAR_BUCKET).upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});if(uErr)throw uErr;
      const {data:urlData}=sb.storage.from(AVATAR_BUCKET).getPublicUrl(path);
      const publicUrl=urlData.publicUrl;
      const {error:dbErr}=await sb.from('it_professional_signups').update({profile_photo_url:publicUrl,photo_status:'pending'}).eq('id',signup.id);if(dbErr)throw dbErr;
      toast('Foto recebida e enviada para aprovação');await renderPanel();
    }catch(e){console.error(e);toast('Não foi possível enviar a foto');btn.disabled=false;btn.textContent='Enviar foto'}
  };

  window.applyRealJob=async function(id){
    if(!currentUser){loginModal();return}
    try{
      const {data:pro,error:pErr}=await sb.from('it_public_professionals').select('id,is_published').eq('user_id',currentUser.id).eq('is_published',true).maybeSingle();if(pErr)throw pErr;
      if(!pro){modal(`<div class="notice">📸 Para se candidatar a uma vaga real, seu perfil profissional precisa estar aprovado e publicado.</div><h2>Perfil ainda não ativo</h2><p class="muted">Faça o pré-cadastro e envie sua foto pelo Painel. Depois da aprovação, as candidaturas reais serão liberadas.</p><div class="modal-actions"><button class="btn btn--green" onclick="closeModal();workerModal()">Fazer pré-cadastro</button><button class="btn btn--outline" onclick="closeModal();go('painel')">Ir ao painel</button></div>`);return}
      const {data:existing,error:eErr}=await sb.from('it_applications').select('id,status').eq('opportunity_id',id).eq('professional_id',pro.id).maybeSingle();if(eErr)throw eErr;
      if(existing){toast('Você já demonstrou interesse nessa vaga');go('painel');return}
      const {error}=await sb.from('it_applications').insert({opportunity_id:id,professional_id:pro.id,status:'interested'});if(error)throw error;
      closeModal();toast('Interesse enviado com sucesso');go('painel');
    }catch(e){console.error(e);toast('Não foi possível enviar sua candidatura')}
  };

  window.openJob=function(id){
    if(String(id).startsWith('sample-'))return previousOpenJob(id);
    const o=publicJobs.find(x=>x.id===id);if(!o)return;
    modal(`<div class="notice">✅ <b>Vaga real publicada.</b> Sua candidatura fica protegida e só o contratante responsável pode acessá-la.</div><h2>${esc(o.title)}</h2><p class="muted">${esc(o.company)} · ${esc(o.cat)}</p><div class="meta"><span>📅 ${esc(o.date||'A combinar')}</span><span>⏰ ${esc(o.time||'A combinar')}</span><span>👥 ${Number(o.v||1)} vaga(s)</span></div><div class="money">${o.rate?`R$ ${Number(o.rate)}/dia`:'Valor a combinar'}</div><div class="modal-actions"><button class="btn btn--green" onclick="applyRealJob('${esc(id)}')">${currentUser?'Tenho interesse':'Entrar para me candidatar'}</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
  };

  window.withdrawApplication=async function(id){
    const {error}=await sb.from('it_applications').update({status:'withdrawn'}).eq('id',id);if(error){console.error(error);toast('Não foi possível retirar a candidatura');return}toast('Candidatura retirada');renderPanel();
  };

  window.setApplicationStatus=async function(id,status){
    if(!['selected','rejected'].includes(status))return;
    const {error}=await sb.from('it_applications').update({status}).eq('id',id);if(error){console.error(error);toast('Não foi possível atualizar a candidatura');return}toast(status==='selected'?'Profissional selecionado':'Candidatura encerrada');renderPanel();
  };

  window.reviewService=function(serviceId,side){
    modal(`<div class="notice">⭐ Avaliações só são aceitas para serviços concluídos e ficam em moderação antes de aparecer publicamente.</div><h2>Avaliar serviço</h2><div class="field"><label>Nota</label><select id="reviewRating"><option value="5">5 — Excelente</option><option value="4">4 — Muito bom</option><option value="3">3 — Bom</option><option value="2">2 — Regular</option><option value="1">1 — Ruim</option></select></div><div class="field" style="margin-top:10px"><label>Comentário</label><textarea id="reviewComment" placeholder="Conte como foi o serviço"></textarea></div><div class="modal-actions"><button class="btn btn--green" onclick="submitReview('${esc(serviceId)}','${esc(side)}')">Enviar avaliação</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.submitReview=async function(serviceId,side){
    const payload={service_id:serviceId,reviewer_side:side,rating:Number($('reviewRating').value),comment:$('reviewComment').value.trim()||null,is_published:false,reviewer_user_id:currentUser.id};
    const {error}=await sb.from('it_reviews').insert(payload);if(error){console.error(error);toast(error.code==='23505'?'Você já avaliou este serviço':'Não foi possível enviar a avaliação');return}closeModal();toast('Avaliação enviada para moderação');renderPanel();
  };

  window.reportServiceIssue=function(serviceId){
    modal(`<div class="notice">🛡️ Relatos são privados e passam por revisão humana. Nenhuma punição é automática.</div><h2>Relatar problema</h2><div class="field"><label>Motivo</label><select id="incidentReason"><option>No-show / ausência</option><option>Pagamento</option><option>Comportamento</option><option>Segurança</option><option>Outro</option></select></div><div class="field" style="margin-top:10px"><label>Detalhes</label><textarea id="incidentDetails" placeholder="Explique o que aconteceu"></textarea></div><div class="modal-actions"><button class="btn btn--orange" onclick="submitServiceIssue('${esc(serviceId)}')">Enviar relato</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.submitServiceIssue=async function(serviceId){
    const {error}=await sb.from('it_incidents').insert({service_id:serviceId,reason:$('incidentReason').value,details:$('incidentDetails').value.trim()||null,status:'open',reporter_user_id:currentUser.id});
    if(error){console.error(error);toast('Não foi possível enviar o relato');return}closeModal();toast('Relato recebido para revisão');
  };

  window.renderPanel=async function(){
    if(!currentUser){
      $('panelKpis').innerHTML=`<article class="kpi"><strong>🔐</strong><span>Login seguro por e-mail</span></article><article class="kpi"><strong>📸</strong><span>Envio de foto</span></article><article class="kpi"><strong>💼</strong><span>Candidaturas reais</span></article><article class="kpi"><strong>⭐</strong><span>Avaliações</span></article>`;
      $('serviceFlow').innerHTML=`<div class="list-row"><div class="grow"><b>Entre para acessar seu painel real</b><div class="small muted">Use o mesmo e-mail do cadastro. Não precisa criar senha.</div></div><button class="btn btn--navy" onclick="loginModal()">Entrar por e-mail</button></div>`;
      $('candidateList').innerHTML=`<div class="list-row"><div class="grow"><b>Seus dados ficam protegidos</b><div class="small muted">Candidaturas, serviços e relatos usam regras de acesso por usuário no Supabase.</div></div><span class="status status--ok">RLS ativo</span></div>`;return;
    }

    $('serviceFlow').innerHTML=emptyState('Carregando seu painel...');$('candidateList').innerHTML='';
    await claimRecords();
    try{
      const uid=currentUser.id;
      const [signRes,hireRes,proRes,companyRes,appRes,serviceRes,reviewRes]=await Promise.all([
        sb.from('it_professional_signups').select('id,created_at,full_name,primary_role,validation_status,whatsapp_confirmation_status,profile_photo_url,photo_status').order('created_at',{ascending:false}),
        sb.from('it_hiring_requests').select('id,created_at,category,vacancies,service_date,status').order('created_at',{ascending:false}),
        sb.from('it_public_professionals').select('id,display_name,role_title,is_published,photo_url').eq('user_id',uid).maybeSingle(),
        sb.from('it_companies').select('id,display_name,is_published').eq('user_id',uid).maybeSingle(),
        sb.from('it_applications').select('id,created_at,opportunity_id,professional_id,status').order('created_at',{ascending:false}),
        sb.from('it_services').select('id,created_at,opportunity_id,professional_id,company_id,status,completed_at').order('created_at',{ascending:false}),
        sb.from('it_reviews').select('id,service_id,rating,is_published').eq('reviewer_user_id',uid)
      ]);
      [signRes,hireRes,proRes,companyRes,appRes,serviceRes,reviewRes].forEach(r=>{if(r.error)throw r.error});
      const signups=signRes.data||[], hires=hireRes.data||[], pro=proRes.data||null, company=companyRes.data||null, apps=appRes.data||[], services=serviceRes.data||[], reviews=reviewRes.data||[];
      const latest=signups[0];
      $('panelKpis').innerHTML=`<article class="kpi"><strong>${signups.length}</strong><span>cadastro(s) profissional(is)</span></article><article class="kpi"><strong>${apps.length}</strong><span>candidaturas acessíveis</span></article><article class="kpi"><strong>${services.length}</strong><span>serviços</span></article><article class="kpi"><strong>${reviews.length}</strong><span>avaliações enviadas</span></article>`;

      let blocks=[];
      blocks.push(`<div class="list-row"><div class="grow"><b>Conta conectada</b><div class="small muted">${esc(currentUser.email)}</div></div><span class="status status--ok">online</span></div>`);
      if(latest){
        blocks.push(`<div class="list-row"><div class="grow"><b>${esc(latest.full_name)} · ${esc(latest.primary_role)}</b><div class="small muted">Cadastro: ${statusLabel(latest.validation_status)} · WhatsApp: ${statusLabel(latest.whatsapp_confirmation_status)} · Foto: ${statusLabel(latest.photo_status)}</div>${latest.profile_photo_url?`<img src="${esc(latest.profile_photo_url)}" alt="Sua foto enviada" style="width:72px;height:72px;object-fit:cover;border-radius:18px;margin-top:9px">`:''}</div><span class="status ${latest.profile_photo_url?'status--ok':'status--wait'}">${latest.profile_photo_url?'Foto recebida':'Falta foto'}</span></div>`);
        blocks.push(`<div class="list-row"><div class="grow"><b>Enviar ou trocar foto de perfil</b><div class="small muted">JPG, PNG ou WebP · máximo 5 MB. A imagem fica pendente até aprovação da IntegraTrampo.</div><div class="field" style="margin-top:9px"><input id="photoFileInput" type="file" accept="image/jpeg,image/png,image/webp"></div></div><button class="btn btn--green" id="uploadPhotoBtn" onclick="uploadProfilePhoto()">Enviar foto</button></div>`);
      }else{
        blocks.push(`<div class="list-row"><div class="grow"><b>Você ainda não tem pré-cadastro profissional vinculado</b><div class="small muted">Se quer trabalhar pela plataforma, comece por aqui.</div></div><button class="btn btn--green" onclick="workerModal()">Quero trabalhar</button></div>`);
      }

      if(apps.length){
        blocks.push(`<div class="list-row"><div class="grow"><b>Minhas candidaturas / candidaturas recebidas</b><div class="small muted">Acesso restrito aos participantes.</div></div><span class="status status--ok">${apps.length}</span></div>`);
        apps.forEach(a=>{
          const job=publicJobs.find(j=>j.id===a.opportunity_id),isMine=pro&&a.professional_id===pro.id;
          const actions=isMine&&a.status==='interested'?`<button class="btn btn--outline" onclick="withdrawApplication('${a.id}')">Retirar</button>`:company&&a.status==='interested'?`<button class="btn btn--green" onclick="setApplicationStatus('${a.id}','selected')">Selecionar</button><button class="btn btn--outline" onclick="setApplicationStatus('${a.id}','rejected')">Recusar</button>`:'';
          blocks.push(`<div class="list-row"><div class="grow"><b>${esc(job?.title||'Oportunidade')}</b><div class="small muted">${fmtDate(a.created_at)} · ${esc(statusLabel(a.status))}</div></div>${actions||`<span class="status status--wait">${esc(statusLabel(a.status))}</span>`}</div>`);
        });
      }

      if(services.length){
        blocks.push(`<div class="list-row"><div class="grow"><b>Serviços</b><div class="small muted">Confirmações e conclusão continuam protegidas entre as partes e a operação.</div></div><span class="status status--ok">${services.length}</span></div>`);
        services.forEach(s=>{
          const side=pro&&s.professional_id===pro.id?'professional':company&&s.company_id===company.id?'company':null;
          const reviewed=reviews.some(r=>r.service_id===s.id);
          const reviewBtn=s.completed_at&&side&&!reviewed?`<button class="btn btn--green" onclick="reviewService('${s.id}','${side}')">Avaliar</button>`:'';
          const incidentBtn=side?`<button class="btn btn--outline" onclick="reportServiceIssue('${s.id}')">Relatar problema</button>`:'';
          blocks.push(`<div class="list-row"><div class="grow"><b>Serviço ${esc(statusLabel(s.status))}</b><div class="small muted">Criado em ${fmtDate(s.created_at)}${s.completed_at?` · concluído em ${fmtDate(s.completed_at)}`:''}</div></div>${reviewBtn}${incidentBtn}</div>`);
        });
      }
      $('serviceFlow').innerHTML=blocks.join('');

      let secondary=[];
      if(hires.length){
        secondary.push(`<div class="list-row"><div class="grow"><b>Pedidos de contratação</b><div class="small muted">${hires.length} pedido(s) vinculados ao seu e-mail.</div></div><span class="status status--ok">${hires.length}</span></div>`);
        hires.slice(0,5).forEach(h=>secondary.push(`<div class="list-row"><div class="grow"><b>${esc(h.category)} · ${Number(h.vacancies||1)} vaga(s)</b><div class="small muted">${h.service_date?fmtDate(h.service_date+'T12:00:00'):'Data a combinar'} · ${esc(statusLabel(h.status))}</div></div></div>`));
      }
      if(pro)secondary.push(`<div class="list-row"><div class="grow"><b>Perfil público profissional</b><div class="small muted">${esc(pro.display_name)} · ${esc(pro.role_title)}</div></div><span class="status ${pro.is_published?'status--ok':'status--wait'}">${pro.is_published?'Publicado':'Aguardando'}</span></div>`);
      if(company)secondary.push(`<div class="list-row"><div class="grow"><b>Perfil de contratante</b><div class="small muted">${esc(company.display_name)}</div></div><span class="status ${company.is_published?'status--ok':'status--wait'}">${company.is_published?'Publicado':'Aguardando'}</span></div>`);
      secondary.push(`<div class="list-row"><div class="grow"><b>Privacidade</b><div class="small muted">Dados privados são filtrados por usuário com Row Level Security.</div></div><span class="status status--ok">Protegido</span></div>`);
      secondary.push(`<div class="list-row"><div class="grow"><b>Sair desta conta</b><div class="small muted">Encerra a sessão neste aparelho.</div></div><button class="btn btn--outline" onclick="signOutIntegraTrampo()">Sair</button></div>`);
      $('candidateList').innerHTML=secondary.join('');
    }catch(e){console.error(e);$('serviceFlow').innerHTML=emptyState('Não foi possível carregar seu painel agora.');$('candidateList').innerHTML=`<div class="list-row"><div class="grow"><b>Conta conectada</b><div class="small muted">${esc(currentUser.email)}</div></div><button class="btn btn--outline" onclick="signOutIntegraTrampo()">Sair</button></div>`}
  };

  try{
    const mod=await import('https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm');
    sb=mod.createClient(SUPABASE_URL,SUPABASE_KEY,{auth:{persistSession:true,autoRefreshToken:true,detectSessionInUrl:true}});
    window.IntegraTrampoSupabase=sb;
    const {data:{session}}=await sb.auth.getSession();currentSession=session;currentUser=session?.user||null;
    if(currentUser)await claimRecords();
    updateLoginButton();
    if($('workerBtn'))$('workerBtn').onclick=()=>workerModal();
    if($('hireBtn'))$('hireBtn').onclick=()=>hiringModal();
    if($('hireBtn2'))$('hireBtn2').onclick=()=>hiringModal();
    if($('loginBtn'))updateLoginButton();
    sb.auth.onAuthStateChange(async(event,session)=>{
      currentSession=session;currentUser=session?.user||null;if(currentUser)await claimRecords();else claimedUserId=null;updateLoginButton();
      if(event==='SIGNED_IN'){toast('Acesso liberado');go('painel')}else if(event==='SIGNED_OUT'&&$('screen-painel')?.classList.contains('is-active'))renderPanel();
    });
    if(window.location.hash&&currentUser){try{history.replaceState(null,'',window.location.pathname+window.location.search)}catch{}}
    if($('screen-painel')?.classList.contains('is-active'))renderPanel();
  }catch(e){
    console.error('Falha ao iniciar Supabase Auth',e);
    window.loginModal=function(){modal(`<div class="notice">⚠️ O módulo de acesso não carregou neste momento.</div><h2>Tente novamente</h2><p class="muted">Recarregue a página. O cadastro público continua disponível normalmente.</p><button class="btn btn--outline" onclick="closeModal()">Fechar</button>`)};
    if($('loginBtn'))$('loginBtn').onclick=()=>loginModal();
  }
})();
