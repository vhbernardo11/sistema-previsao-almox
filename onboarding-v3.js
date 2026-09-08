// IntegraTrampo · onboarding profissional v3.2
// Conta própria + foto obrigatória (câmera ou galeria) + revisão humana.
(function(){
  const AVATAR_BUCKET='integratrampo-avatars';
  const PENDING_KEY='integratrampo_pending_onboarding_v3';
  const WORK_CATEGORIES=[
    ['🍽️','Garçom'],['🍸','Barman'],['🍳','Auxiliar de cozinha'],['🔥','Churrasqueiro'],
    ['🧹','Diarista'],['🧽','Faxineira'],['⚡','Eletricista'],['🌿','Jardineiro'],
    ['🛡️','Segurança de eventos'],['🚪','Controlador de acesso'],['👁️','Vigia'],['🛡️','Vigilante'],
    ['🎨','Pintor'],['🖌️','Pintor residencial'],['🚰','Encanador'],['🛎️','Recepção'],
    ['🧼','Limpeza de eventos'],['🧰','Serviços gerais'],['•••','Outros']
  ];
  const WEEK=[
    ['mon','Segunda','Seg'],['tue','Terça','Ter'],['wed','Quarta','Qua'],['thu','Quinta','Qui'],
    ['fri','Sexta','Sex'],['sat','Sábado','Sáb'],['sun','Domingo','Dom']
  ];
  let sb=null,photoFile=null,previewUrl=null,initialized=false;
  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const isEmail=v=>/^\S+@\S+\.\S+$/.test(v||'');
  const tell=m=>typeof toast==='function'?toast(m):alert(m);

  function injectStyles(){
    if($id('itOnboardingV3Styles'))return;
    const s=document.createElement('style');s.id='itOnboardingV3Styles';s.textContent=`
      .work-chip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.work-chip{display:flex;align-items:center;gap:8px;text-align:left;border:1px solid #dbe4ee;background:#fff;border-radius:14px;padding:10px 11px;font-weight:750;color:#0D1B2A;cursor:pointer;min-height:46px}.work-chip.is-selected{border-color:#16B898;background:#ecfdf8;box-shadow:0 0 0 1px #16B898 inset}.work-chip__icon{font-size:18px;line-height:1}
      .schedule-box{display:grid;gap:8px;margin-top:8px}.schedule-row{display:grid;grid-template-columns:minmax(112px,1fr) 92px 20px 92px;gap:7px;align-items:center;border:1px solid #e2e8f0;border-radius:14px;padding:9px 10px;background:#fff}.schedule-day{display:flex;align-items:center;gap:8px;font-weight:800;color:#0D1B2A}.schedule-day input{width:18px;height:18px;accent-color:#16B898}.schedule-row input[type=time]{width:100%;min-width:0;padding:8px 6px;border:1px solid #d7e0e9;border-radius:10px;background:#f8fafc;color:#0D1B2A;font:inherit}.schedule-sep{text-align:center;color:#6B7280;font-size:12px}.quick-schedule{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 2px}.quick-schedule button{border:1px solid #dbe4ee;background:#f8fafc;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;cursor:pointer}
      .photo-onboard{border:1px solid #dce5ee;border-radius:16px;padding:14px;background:#f8fafc}.photo-preview{width:126px;height:126px;border-radius:22px;object-fit:cover;border:2px solid #fff;box-shadow:0 5px 18px rgba(13,27,42,.12);display:none;margin:10px auto}.photo-actions{display:flex;gap:8px;flex-wrap:wrap;justify-content:center;margin-top:10px}.photo-actions label{cursor:pointer}.photo-checklist{font-size:12px;color:#5f6b78;line-height:1.55;margin-top:10px}.photo-status{text-align:center;font-weight:800;font-size:13px;margin-top:8px;color:#0D1B2A}
      @media(max-width:560px){.work-chip-grid{grid-template-columns:1fr 1fr}.work-chip{padding:9px;font-size:13px}.photo-actions .btn{flex:1}}@media(max-width:390px){.work-chip-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  async function getUser(){
    if(!sb)sb=window.IntegraTrampoSupabase||null;
    if(!sb)return null;
    try{const {data}=await sb.auth.getUser();return data?.user||null}catch{return null}
  }

  function acquisitionFields(){
    const a=window.IntegraTrampoAcquisition||{};
    return {acquisition_source:a.acquisition_source||'direct',acquisition_medium:a.acquisition_medium||null,acquisition_campaign:a.acquisition_campaign||null,acquisition_content:a.acquisition_content||null,acquisition_term:a.acquisition_term||null,referrer_url:a.referrer_url||document.referrer||null,landing_path:a.landing_path||window.location.pathname};
  }

  function categoryHtml(){return WORK_CATEGORIES.map(([icon,name])=>`<button type="button" class="work-chip" data-work-category="${esc(name)}" aria-pressed="false"><span class="work-chip__icon">${icon}</span><span>${esc(name)}</span></button>`).join('')}
  function scheduleHtml(){return WEEK.map(([code,label])=>`<div class="schedule-row" data-schedule-day="${code}" data-day-label="${esc(label)}"><label class="schedule-day"><input type="checkbox" class="schedule-enabled"> <span>${esc(label)}</span></label><input type="time" class="schedule-start" value="00:00" disabled><span class="schedule-sep">às</span><input type="time" class="schedule-end" value="23:59" disabled></div>`).join('')}

  function bindControls(){
    document.querySelectorAll('[data-work-category]').forEach(btn=>btn.addEventListener('click',()=>{const on=!btn.classList.contains('is-selected');btn.classList.toggle('is-selected',on);btn.setAttribute('aria-pressed',String(on))}));
    document.querySelectorAll('[data-schedule-day]').forEach(row=>{const check=row.querySelector('.schedule-enabled'),start=row.querySelector('.schedule-start'),end=row.querySelector('.schedule-end');check?.addEventListener('change',()=>{const on=check.checked;if(start){start.disabled=!on;start.value='00:00'}if(end){end.disabled=!on;end.value='23:59'}})});
    const setDays=codes=>document.querySelectorAll('[data-schedule-day]').forEach(row=>{const on=codes.includes(row.dataset.scheduleDay),check=row.querySelector('.schedule-enabled'),start=row.querySelector('.schedule-start'),end=row.querySelector('.schedule-end');if(check)check.checked=on;if(start){start.disabled=!on;start.value='00:00'}if(end){end.disabled=!on;end.value='23:59'}});
    $id('scheduleAll')?.addEventListener('click',()=>setDays(WEEK.map(x=>x[0])));$id('scheduleWeek')?.addEventListener('click',()=>setDays(['mon','tue','wed','thu','fri']));$id('scheduleWeekend')?.addEventListener('click',()=>setDays(['sat','sun']));$id('scheduleClear')?.addEventListener('click',()=>setDays([]));
    $id('wPhotoCamera')?.addEventListener('change',e=>preparePhoto(e.target.files?.[0]));
    $id('wPhotoGallery')?.addEventListener('change',e=>preparePhoto(e.target.files?.[0]));
  }

  function readCategories(){return [...document.querySelectorAll('[data-work-category].is-selected')].map(x=>x.dataset.workCategory).filter(Boolean)}
  function readSchedule(){
    const schedule={},codes=[];
    document.querySelectorAll('[data-schedule-day]').forEach(row=>{if(!row.querySelector('.schedule-enabled')?.checked)return;const code=row.dataset.scheduleDay,label=row.dataset.dayLabel||code;schedule[code]={label,start:'00:00',end:'23:59'};codes.push(code)});
    const compact=window.IntegraTrampoAvailabilityV4?.compactDays?.(codes)||WEEK.filter(x=>codes.includes(x[0])).map(x=>x[2]).join(' • ');
    return {schedule,summary:compact,codes};
  }

  async function imageInfo(file){
    return await new Promise((resolve,reject)=>{const u=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({width:img.naturalWidth,height:img.naturalHeight,url:u,img});img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('invalid_image'))};img.src=u});
  }

  async function normalizePhoto(file){
    if(!file)throw new Error('photo_required');
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('invalid_type');
    if(file.size>12*1024*1024)throw new Error('too_large');
    const info=await imageInfo(file);
    if(info.width<320||info.height<320){URL.revokeObjectURL(info.url);throw new Error('too_small')}
    const max=1600,scale=Math.min(1,max/Math.max(info.width,info.height));
    if(scale===1&&file.size<=3.5*1024*1024){URL.revokeObjectURL(info.url);return file}
    const canvas=document.createElement('canvas');canvas.width=Math.round(info.width*scale);canvas.height=Math.round(info.height*scale);canvas.getContext('2d',{alpha:false}).drawImage(info.img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(info.url);
    const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.86));if(!blob)throw new Error('compress_failed');
    return new File([blob],`perfil-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
  }

  async function preparePhoto(file){
    const status=$id('wPhotoStatus');
    try{
      if(status)status.textContent='Preparando foto...';photoFile=await normalizePhoto(file);
      if(previewUrl)URL.revokeObjectURL(previewUrl);previewUrl=URL.createObjectURL(photoFile);
      const img=$id('wPhotoPreview');if(img){img.src=previewUrl;img.style.display='block'}
      if(status)status.textContent='✅ Foto pronta para envio e análise';
    }catch(e){
      photoFile=null;
      const msg=e.message==='too_small'?'Use uma foto com pelo menos 320×320 px.':e.message==='too_large'?'A imagem original é grande demais. Escolha outra foto.':e.message==='invalid_type'?'Use JPG, PNG ou WebP.':'Não foi possível usar essa imagem.';
      if(status)status.textContent='⚠️ '+msg;tell(msg);
    }
  }

  function requireLoginForWorker(){
    try{localStorage.setItem(PENDING_KEY,'worker')}catch{}
    if(typeof loginModal==='function'){
      loginModal();
      setTimeout(()=>{const box=document.querySelector('#modalRoot .notice');if(box)box.innerHTML='🔐 <b>Entre ou crie sua conta IntegraTrampo.</b> Use e-mail ou telefone + senha. Depois você volta automaticamente para concluir o cadastro com a foto obrigatória.'},0);
    }else tell('Entre na sua conta para continuar o cadastro.');
  }

  window.workerModal=async function(){
    injectStyles();photoFile=null;if(previewUrl){URL.revokeObjectURL(previewUrl);previewUrl=null}
    const user=await getUser();if(!user){requireLoginForWorker();return}
    const {data:existing}=await sb.from('it_professional_signups').select('id,validation_status').eq('user_id',user.id).order('created_at',{ascending:false}).limit(1);
    if(existing?.length){modal(`<div class="notice">👤 Você já possui cadastro profissional nesta conta.</div><h2>Seu perfil já existe</h2><p class="muted">Use o painel para editar seus dados, disponibilidade ou trocar sua foto. Alterações sensíveis voltam para revisão da IntegraTrampo.</p><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();go('painel')">Abrir meu painel</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);return}
    const accountEmail=user.email||'';
    const accountPhone=user.phone||'';
    const accountName=user.user_metadata?.full_name||user.user_metadata?.name||'';
    modal(`<div class="notice">🛡️ <b>Cadastro com revisão humana.</b> A foto é obrigatória e só fica pública depois da aprovação da IntegraTrampo.</div>
      <h2>Quero trabalhar</h2><div class="form-grid">
      <div class="field"><label>Nome completo</label><input id="wName" value="${esc(accountName)}" placeholder="Seu nome"></div>
      <div class="field"><label>WhatsApp</label><input id="wPhone" value="${esc(accountPhone)}" inputmode="tel" placeholder="(18) 99999-9999"></div>
      <div class="field full"><label>E-mail ${accountEmail?'da conta':'(opcional para conta por telefone)'}</label><input id="wEmail" type="email" value="${esc(accountEmail)}" ${accountEmail?'readonly':''} placeholder="nome@email.com"></div>
      <div class="field full"><label>Foto de perfil obrigatória</label><div class="photo-onboard"><img id="wPhotoPreview" class="photo-preview" alt="Prévia da sua foto"><div class="photo-actions"><label class="btn btn--navy" for="wPhotoCamera">📷 Tirar foto agora</label><label class="btn btn--outline" for="wPhotoGallery">🖼️ Escolher da galeria</label></div><input id="wPhotoCamera" type="file" accept="image/*" capture="user" style="display:none"><input id="wPhotoGallery" type="file" accept="image/jpeg,image/png,image/webp" style="display:none"><div id="wPhotoStatus" class="photo-status">Nenhuma foto selecionada</div><div class="photo-checklist">Apareça sozinho, de frente, com o rosto visível e boa iluminação. Você pode tirar a foto na hora ou enviar uma imagem da galeria.</div></div></div>
      <div class="field full"><label>Áreas em que você trabalha</label><div class="small muted">Selecione uma ou mais. A primeira será sua área principal.</div><div class="work-chip-grid">${categoryHtml()}</div></div>
      <div class="field"><label>Cidade</label><input id="wCity" value="Teodoro Sampaio"></div><div class="field"><label>Bairro</label><input id="wNeighborhood" placeholder="Ex.: Centro"></div>
      <div class="field"><label>Diária de referência</label><input id="wRate" inputmode="decimal" placeholder="150"></div><div class="field"><label>Transporte próprio</label><select id="wTransport"><option value="false">Não</option><option value="true">Sim</option></select></div>
      <div class="field full"><label>Disponibilidade semanal</label><div class="quick-schedule"><button type="button" id="scheduleAll">Todos os dias</button><button type="button" id="scheduleWeek">Seg–Sex</button><button type="button" id="scheduleWeekend">Fim de semana</button><button type="button" id="scheduleClear">Limpar</button></div><div class="schedule-box">${scheduleHtml()}</div></div>
      <div class="field full"><label>Experiência / apresentação</label><textarea id="wExperience" maxlength="1200" placeholder="Conte rapidamente sua experiência"></textarea></div></div>
      <div class="modal-actions"><button class="btn btn--green" id="saveWorkerBtn" onclick="saveWorker()">Enviar cadastro para análise</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
    bindControls();
    setTimeout(()=>window.IntegraTrampoAvailabilityV4?.refresh?.(),0);
  };

  window.saveWorker=async function(){
    const user=await getUser();if(!user){requireLoginForWorker();return}
    const btn=$id('saveWorkerBtn'),name=$id('wName')?.value.trim()||'',phone=$id('wPhone')?.value.trim()||'',email=$id('wEmail')?.value.trim().toLowerCase()||'',city=$id('wCity')?.value.trim()||'Teodoro Sampaio',categories=readCategories(),{schedule,summary}=readSchedule();
    if(name.length<2||phone.replace(/\D/g,'').length<10){tell('Preencha nome e WhatsApp corretamente');return}
    if(email&&!isEmail(email)){tell('Informe um e-mail válido ou deixe o campo vazio');return}
    if(!photoFile){tell('Tire uma foto ou escolha uma imagem da galeria antes de continuar');return}
    if(!categories.length){tell('Selecione pelo menos uma área de trabalho');return}
    if(!Object.keys(schedule).length){tell('Marque pelo menos um dia de disponibilidade');return}
    if(btn){btn.disabled=true;btn.textContent='Enviando foto...'}
    try{
      const ext=photoFile.type==='image/png'?'png':photoFile.type==='image/webp'?'webp':'jpg',path=`${user.id}/cadastro-${Date.now()}.${ext}`;
      const {error:uErr}=await sb.storage.from(AVATAR_BUCKET).upload(path,photoFile,{contentType:photoFile.type,cacheControl:'3600',upsert:false});if(uErr)throw uErr;
      const photoUrl=sb.storage.from(AVATAR_BUCKET).getPublicUrl(path).data.publicUrl;
      if(btn)btn.textContent='Salvando cadastro...';
      const payload={full_name:name,whatsapp:phone,email:email||null,city,neighborhood:$id('wNeighborhood')?.value.trim()||null,primary_role:categories[0],work_categories:categories,experience:$id('wExperience')?.value.trim()||null,reference_daily:$id('wRate')?.value?Number($id('wRate').value.replace(',','.')):null,has_transport:$id('wTransport')?.value==='true',availability:summary,availability_schedule:schedule,availability_status:'available_week',availability_updated_at:new Date().toISOString(),whatsapp_confirmation_status:'pending',validation_status:'new',profile_photo_url:photoUrl,photo_status:'pending',source:'vercel_free_stack',user_id:user.id,...acquisitionFields()};
      const {error}=await sb.from('it_professional_signups').insert(payload);if(error)throw error;
      try{localStorage.removeItem(PENDING_KEY)}catch{};try{await loadMetrics()}catch{};closeModal();tell('Cadastro e foto enviados para análise');
      const msg=encodeURIComponent(`👋 Olá! Fiz meu cadastro na *IntegraTrampo* e quero confirmar meu WhatsApp.\n\n👤 *Nome:* ${name}\n📱 *WhatsApp:* ${phone}\n📍 *Cidade:* ${city}\n💼 *Área principal:* ${categories[0]}\n\n📸 Minha foto já foi enviada pelo sistema e está aguardando análise.\n✅ Quero confirmar meu WhatsApp.`);
      window.open(`https://wa.me/${typeof WA_NUMBER!=='undefined'?WA_NUMBER:'5518981485892'}?text=${msg}`,'_blank');
      setTimeout(()=>{if(typeof go==='function')go('painel');if(typeof renderPanel==='function')renderPanel()},250);
    }catch(e){
      console.error('worker signup v3.2',e);
      const m=String(e?.message||'');tell(m.includes('photo_required')?'A foto é obrigatória para concluir o cadastro.':'Não foi possível concluir o cadastro agora');
      if(btn){btn.disabled=false;btn.textContent='Enviar cadastro para análise'}
    }
  };

  async function resumePending(user){
    if(!user)return;let pending='';try{pending=localStorage.getItem(PENDING_KEY)||''}catch{};
    if(pending==='worker'){try{localStorage.removeItem(PENDING_KEY)}catch{};setTimeout(()=>window.workerModal(),650)}
  }

  async function init(){
    if(initialized)return;initialized=true;injectStyles();for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;if(!sb)return;
    const {data}=await sb.auth.getUser();await resumePending(data?.user||null);
    sb.auth.onAuthStateChange((event,session)=>{if(event==='SIGNED_IN')setTimeout(()=>resumePending(session?.user||null),50)});
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();