// IntegraTrampo · política piloto de entrada rápida
// Novos profissionais entram automaticamente como aprovados/publicados no backend.
// Foto continua opcional e pode ser adicionada depois sem tirar o perfil do ar.
(function(){
  const PLACEHOLDER='./avatar-placeholder.svg';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isEmail=v=>/^\S+@\S+\.\S+$/.test(v||'');

  async function getUser(){
    const sb=window.IntegraTrampoSupabase;
    if(!sb)return null;
    try{const {data}=await sb.auth.getSession();return data?.session?.user||null}catch{return null}
  }

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

  window.workerModal=async function(){
    const currentUser=await getUser();
    const email=currentUser?.email||'';
    modal(`<div class="notice">✅ <b>Entrada rápida do piloto.</b> Seu cadastro profissional é ativado automaticamente. A foto pode ser adicionada depois.</div>
      <h2>Quero trabalhar</h2><div class="form-grid">
      <div class="field"><label>Nome completo</label><input id="wName" placeholder="Seu nome"></div>
      <div class="field"><label>WhatsApp</label><input id="wPhone" inputmode="tel" placeholder="(18) 99999-9999"></div>
      <div class="field full"><label>E-mail para acessar o painel</label><input id="wEmail" type="email" value="${esc(email)}" ${currentUser?'readonly':''} placeholder="voce@exemplo.com"></div>
      <div class="field"><label>Área principal</label><select id="wRole"><option>Garçom</option><option>Barman</option><option>Auxiliar de cozinha</option><option>Churrasqueiro</option><option>Diarista</option><option>Limpeza</option><option>Recepção</option><option>Pintor</option><option>Eletricista</option><option>Jardineiro</option><option>Outros</option></select></div>
      <div class="field"><label>Cidade</label><input id="wCity" value="Teodoro Sampaio"></div>
      <div class="field"><label>Diária de referência</label><input id="wRate" inputmode="decimal" placeholder="150"></div>
      <div class="field"><label>Transporte próprio</label><select id="wTransport"><option value="false">Não</option><option value="true">Sim</option></select></div>
      <div class="field full"><label>Disponibilidade</label><input id="wAvailability" placeholder="Ex.: noites e fins de semana"></div>
      <div class="field full"><label>Experiência</label><textarea id="wExperience" placeholder="Conte rapidamente sua experiência"></textarea></div></div>
      <div class="modal-actions"><button class="btn btn--green" id="saveWorkerBtn" onclick="saveWorker()">Cadastrar e publicar</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  };

  window.saveWorker=async function(){
    const sb=window.IntegraTrampoSupabase;
    const btn=$('saveWorkerBtn'),name=$('wName')?.value.trim()||'',phone=$('wPhone')?.value.trim()||'',email=$('wEmail')?.value.trim().toLowerCase()||'',city=$('wCity')?.value.trim()||'Teodoro Sampaio',role=$('wRole')?.value||'Outros';
    if(name.length<2||phone.replace(/\D/g,'').length<10){toast('Preencha nome e WhatsApp corretamente');return}
    if(!isEmail(email)){toast('Informe um e-mail válido para acessar seu painel');return}
    if(!sb){toast('Conexão indisponível. Tente novamente em instantes.');return}
    if(btn){btn.disabled=true;btn.textContent='Publicando...'}
    try{
      const currentUser=await getUser();
      const payload={
        full_name:name,whatsapp:phone,email,city,primary_role:role,
        experience:$('wExperience')?.value.trim()||null,
        reference_daily:$('wRate')?.value?Number($('wRate').value.replace(',','.')):null,
        has_transport:$('wTransport')?.value==='true',
        availability:$('wAvailability')?.value.trim()||null,
        whatsapp_confirmation_status:'pending',validation_status:'new',photo_status:'pending',
        source:'vercel_free_stack',user_id:currentUser?.id||null,...acquisitionFields()
      };
      const {error}=await sb.from('it_professional_signups').insert(payload);if(error)throw error;
      try{await loadMetrics()}catch{}
      try{await loadPublicData()}catch{}
      closeModal();
      if(currentUser){toast('Cadastro aprovado e publicado');go('painel');return}
      modal(`<div class="notice">✅ <b>Cadastro aprovado e publicado!</b></div><h2>Você já está na IntegraTrampo</h2><p class="muted">Não é necessário confirmar o cadastro pelo WhatsApp. A foto é opcional e pode ser adicionada depois pelo painel.</p><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();loginModal()">Entrar no painel</button><button class="btn btn--outline" onclick="closeModal()">Continuar navegando</button></div>`);
    }catch(e){console.error('auto signup',e);toast('Não foi possível concluir o cadastro agora');if(btn){btn.disabled=false;btn.textContent='Cadastrar e publicar'}}
  };

  window.uploadProfilePhoto=async function(){
    const sb=window.IntegraTrampoSupabase,currentUser=await getUser();
    if(!sb||!currentUser){loginModal();return}
    const input=$('photoFileInput'),btn=$('uploadPhotoBtn'),file=input?.files?.[0];
    if(!file){toast('Escolha uma foto');return}
    if(!['image/jpeg','image/png','image/webp'].includes(file.type)){toast('Use JPG, PNG ou WebP');return}
    if(file.size>5*1024*1024){toast('A foto deve ter no máximo 5 MB');return}
    if(btn){btn.disabled=true;btn.textContent='Enviando foto...'}
    try{
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';
      const path=`${currentUser.id}/perfil-${Date.now()}.${ext}`;
      const {error:uErr}=await sb.storage.from('integratrampo-avatars').upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});if(uErr)throw uErr;
      const {data:urlData}=sb.storage.from('integratrampo-avatars').getPublicUrl(path);
      const {error:rErr}=await sb.rpc('it_update_my_photo',{p_photo_url:urlData.publicUrl});if(rErr)throw rErr;
      toast('Foto atualizada');try{await loadPublicData()}catch{};try{await renderPanel()}catch{}
    }catch(e){console.error('photo',e);toast('Não foi possível enviar a foto');if(btn){btn.disabled=false;btn.textContent='Enviar foto'}}
  };

  window.notificationModal=function(){
    modal(`<h2>Notificações</h2><div class="list"><div class="list-row"><div class="grow"><b>Entrada rápida ativa</b><div class="small muted">Novos profissionais são aprovados e publicados automaticamente durante o piloto.</div></div><span class="status status--ok">ativa</span></div><div class="list-row"><div class="grow"><b>Foto opcional</b><div class="small muted">O profissional pode adicionar uma foto depois sem perder a publicação.</div></div><span class="status status--ok">opcional</span></div></div><div class="modal-actions"><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
  };

  window.loadPublicData=async function(){
    try{
      const [pr,jb,co]=await Promise.all([
        apiGet('it_public_professionals?is_published=eq.true&select=id,display_name,role_title,city,reference_daily,has_transport,availability,rating,review_count,photo_url'),
        apiGet('it_opportunities?status=eq.published&select=id,title,category,city,service_date,start_time,end_time,daily_rate,vacancies,image_url,company_id'),
        apiGet('it_companies?is_published=eq.true&select=id,display_name,kind,city,rating,review_count,logo_url')
      ]);
      if(pr.ok){publicPros=(await pr.json()).map(x=>({id:x.id,name:x.display_name,role:x.role_title,city:x.city,rate:Number(x.reference_daily)||null,rating:Number(x.rating)||0,reviews:x.review_count||0,tags:[x.has_transport?'Transporte':'Local',x.availability||'Disponível'],img:x.photo_url||PLACEHOLDER,has_transport:x.has_transport,has_photo:!!x.photo_url}))}
      if(co.ok){publicCompanies=(await co.json()).filter(x=>x.logo_url).map(x=>({id:x.id,name:x.display_name,kind:x.kind||'Contratante',city:x.city,rating:Number(x.rating)||0,jobs:x.review_count||0,img:x.logo_url}))}
      if(jb.ok){const rows=await jb.json();publicJobs=rows.map(x=>({id:x.id,title:x.title,company:'Contratante aprovado',cat:x.category,date:x.service_date||'A combinar',time:[x.start_time,x.end_time].filter(Boolean).join(' às ')||'A combinar',rate:Number(x.daily_rate)||null,v:x.vacancies||1,img:x.image_url,city:x.city,service_date:x.service_date}))}
    }catch(e){console.warn('public data',e)}
    try{renderAll()}catch{}
  };

  const originalRenderOps=window.renderOps;
  window.renderOps=function(){
    try{originalRenderOps?.()}catch{}
    const q=$('opsQueue');
    if(q)q.innerHTML=`<div class="list-row"><div class="grow"><b>Aprovação automática no piloto</b><div class="small muted">Novos profissionais entram publicados imediatamente. A equipe ainda pode suspender ou rejeitar perfis pelo ADM quando necessário.</div></div><span class="status status--ok">Ativa</span></div><div class="list-row"><div class="grow"><b>Foto opcional</b><div class="small muted">Perfis sem foto usam um avatar neutro até o usuário adicionar sua imagem.</div></div><span class="status status--ok">Opcional</span></div>`;
  };

  setTimeout(()=>{try{loadPublicData()}catch{};try{renderOps()}catch{}},100);
})();