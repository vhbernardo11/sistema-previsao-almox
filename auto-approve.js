// IntegraTrampo · política piloto de entrada rápida
// Novos profissionais entram automaticamente como aprovados/publicados no backend.
// Foto continua opcional e pode ser adicionada depois sem tirar o perfil do ar.
(function(){
  const PLACEHOLDER='./avatar-placeholder.svg';
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const isEmail=v=>/^\S+@\S+\.\S+$/.test(v||'');
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

  function injectRegistrationStyles(){
    if(document.getElementById('itRegistrationV2Styles'))return;
    const s=document.createElement('style');s.id='itRegistrationV2Styles';s.textContent=`
      .work-chip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}
      .work-chip{display:flex;align-items:center;gap:8px;text-align:left;border:1px solid #dbe4ee;background:#fff;border-radius:14px;padding:10px 11px;font-weight:750;color:#0D1B2A;cursor:pointer;min-height:46px}
      .work-chip.is-selected{border-color:#16B898;background:#ecfdf8;box-shadow:0 0 0 1px #16B898 inset}
      .work-chip__icon{font-size:18px;line-height:1}.schedule-box{display:grid;gap:8px;margin-top:8px}
      .schedule-row{display:grid;grid-template-columns:minmax(112px,1fr) 92px 20px 92px;gap:7px;align-items:center;border:1px solid #e2e8f0;border-radius:14px;padding:9px 10px;background:#fff}
      .schedule-day{display:flex;align-items:center;gap:8px;font-weight:800;color:#0D1B2A}.schedule-day input{width:18px;height:18px;accent-color:#16B898}
      .schedule-row input[type=time]{width:100%;min-width:0;padding:8px 6px;border:1px solid #d7e0e9;border-radius:10px;background:#f8fafc;color:#0D1B2A;font:inherit}
      .schedule-row input[type=time]:disabled{opacity:.45}.schedule-sep{text-align:center;color:#6B7280;font-size:12px}
      .quick-schedule{display:flex;gap:7px;flex-wrap:wrap;margin:8px 0 2px}.quick-schedule button{border:1px solid #dbe4ee;background:#f8fafc;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;cursor:pointer}
      @media(max-width:560px){.work-chip-grid{grid-template-columns:1fr 1fr}.work-chip{padding:9px;font-size:13px}.schedule-row{grid-template-columns:1fr 78px 14px 78px;padding:8px}.schedule-row input[type=time]{font-size:12px;padding:7px 3px}}
      @media(max-width:390px){.work-chip-grid{grid-template-columns:1fr}.schedule-row{grid-template-columns:1fr 72px 10px 72px}.schedule-day{font-size:13px}}
    `;document.head.appendChild(s);
  }

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

  function categoryHtml(){
    return WORK_CATEGORIES.map(([icon,name])=>`<button type="button" class="work-chip" data-work-category="${esc(name)}" aria-pressed="false"><span class="work-chip__icon">${icon}</span><span>${esc(name)}</span></button>`).join('');
  }

  function scheduleHtml(){
    return WEEK.map(([code,label])=>`<div class="schedule-row" data-schedule-day="${code}" data-day-label="${esc(label)}">
      <label class="schedule-day"><input type="checkbox" class="schedule-enabled"> <span>${esc(label)}</span></label>
      <input type="time" class="schedule-start" value="08:00" disabled aria-label="Início ${esc(label)}">
      <span class="schedule-sep">às</span>
      <input type="time" class="schedule-end" value="18:00" disabled aria-label="Fim ${esc(label)}">
    </div>`).join('');
  }

  function bindRegistrationControls(){
    document.querySelectorAll('[data-work-category]').forEach(btn=>btn.addEventListener('click',()=>{
      const on=!btn.classList.contains('is-selected');btn.classList.toggle('is-selected',on);btn.setAttribute('aria-pressed',String(on));
    }));
    document.querySelectorAll('[data-schedule-day]').forEach(row=>{
      const check=row.querySelector('.schedule-enabled'),start=row.querySelector('.schedule-start'),end=row.querySelector('.schedule-end');
      check?.addEventListener('change',()=>{const on=check.checked;if(start)start.disabled=!on;if(end)end.disabled=!on});
    });
    const setDays=codes=>{
      document.querySelectorAll('[data-schedule-day]').forEach(row=>{
        const check=row.querySelector('.schedule-enabled'),start=row.querySelector('.schedule-start'),end=row.querySelector('.schedule-end');
        const on=codes.includes(row.dataset.scheduleDay);if(check)check.checked=on;if(start)start.disabled=!on;if(end)end.disabled=!on;
      });
    };
    const all=document.getElementById('scheduleAll'),week=document.getElementById('scheduleWeek'),weekend=document.getElementById('scheduleWeekend'),clear=document.getElementById('scheduleClear');
    if(all)all.onclick=()=>setDays(WEEK.map(x=>x[0]));
    if(week)week.onclick=()=>setDays(['mon','tue','wed','thu','fri']);
    if(weekend)weekend.onclick=()=>setDays(['sat','sun']);
    if(clear)clear.onclick=()=>setDays([]);
  }

  function readCategories(){return [...document.querySelectorAll('[data-work-category].is-selected')].map(x=>x.dataset.workCategory).filter(Boolean)}

  function readSchedule(){
    const schedule={};const summary=[];
    document.querySelectorAll('[data-schedule-day]').forEach(row=>{
      const enabled=!!row.querySelector('.schedule-enabled')?.checked;if(!enabled)return;
      const code=row.dataset.scheduleDay,label=row.dataset.dayLabel||code;
      const start=row.querySelector('.schedule-start')?.value||'08:00',end=row.querySelector('.schedule-end')?.value||'18:00';
      schedule[code]={label,start,end};
      const short=(WEEK.find(x=>x[0]===code)||[])[2]||label;
      summary.push(`${short} ${start}–${end}${end<start?' (+1 dia)':''}`);
    });
    return {schedule,summary:summary.join(' · ')};
  }

  window.workerModal=async function(){
    injectRegistrationStyles();
    const currentUser=await getUser();const email=currentUser?.email||'';
    modal(`<div class="notice">✅ <b>Entrada rápida do piloto.</b> Seu cadastro profissional é ativado automaticamente. A foto pode ser adicionada depois.</div>
      <h2>Quero trabalhar</h2><div class="form-grid">
      <div class="field"><label>Nome completo</label><input id="wName" placeholder="Seu nome"></div>
      <div class="field"><label>WhatsApp</label><input id="wPhone" inputmode="tel" placeholder="(18) 99999-9999"></div>
      <div class="field full"><label>E-mail para acessar o painel</label><input id="wEmail" type="email" value="${esc(email)}" ${currentUser?'readonly':''} placeholder="voce@exemplo.com"></div>
      <div class="field full"><label>Áreas em que você trabalha</label><div class="small muted">Selecione uma ou mais. A primeira selecionada será sua área principal.</div><div id="wCategoryGrid" class="work-chip-grid">${categoryHtml()}</div></div>
      <div class="field"><label>Cidade</label><input id="wCity" value="Teodoro Sampaio"></div>
      <div class="field"><label>Bairro</label><input id="wNeighborhood" placeholder="Ex.: Centro"></div>
      <div class="field"><label>Diária de referência</label><input id="wRate" inputmode="decimal" placeholder="150"></div>
      <div class="field"><label>Transporte próprio</label><select id="wTransport"><option value="false">Não</option><option value="true">Sim</option></select></div>
      <div class="field full"><label>Dias e horários disponíveis</label><div class="small muted">Marque os dias e ajuste o horário em que normalmente pode trabalhar.</div>
        <div class="quick-schedule"><button type="button" id="scheduleAll">Todos os dias</button><button type="button" id="scheduleWeek">Seg–Sex</button><button type="button" id="scheduleWeekend">Fim de semana</button><button type="button" id="scheduleClear">Limpar</button></div>
        <div id="wScheduleGrid" class="schedule-box">${scheduleHtml()}</div>
      </div>
      <div class="field full"><label>Experiência</label><textarea id="wExperience" placeholder="Conte rapidamente sua experiência"></textarea></div></div>
      <div class="modal-actions"><button class="btn btn--green" id="saveWorkerBtn" onclick="saveWorker()">Cadastrar e publicar</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
    bindRegistrationControls();
  };

  window.saveWorker=async function(){
    const sb=window.IntegraTrampoSupabase;
    const btn=$('saveWorkerBtn'),name=$('wName')?.value.trim()||'',phone=$('wPhone')?.value.trim()||'',email=$('wEmail')?.value.trim().toLowerCase()||'',city=$('wCity')?.value.trim()||'Teodoro Sampaio';
    const categories=readCategories();const {schedule,summary}=readSchedule();
    if(name.length<2||phone.replace(/\D/g,'').length<10){toast('Preencha nome e WhatsApp corretamente');return}
    if(!isEmail(email)){toast('Informe um e-mail válido para acessar seu painel');return}
    if(!categories.length){toast('Selecione pelo menos uma área de trabalho');return}
    if(!Object.keys(schedule).length){toast('Marque pelo menos um dia de disponibilidade');return}
    if(!sb){toast('Conexão indisponível. Tente novamente em instantes.');return}
    if(btn){btn.disabled=true;btn.textContent='Publicando...'}
    try{
      const currentUser=await getUser();
      const payload={
        full_name:name,whatsapp:phone,email,city,neighborhood:$('wNeighborhood')?.value.trim()||null,primary_role:categories[0],work_categories:categories,
        experience:$('wExperience')?.value.trim()||null,
        reference_daily:$('wRate')?.value?Number($('wRate').value.replace(',','.')):null,
        has_transport:$('wTransport')?.value==='true',
        availability:summary,availability_schedule:schedule,availability_status:'available_week',availability_updated_at:new Date().toISOString(),
        whatsapp_confirmation_status:'pending',validation_status:'new',photo_status:'pending',
        source:'vercel_free_stack',user_id:currentUser?.id||null,...acquisitionFields()
      };
      const {error}=await sb.from('it_professional_signups').insert(payload);if(error)throw error;
      try{await loadMetrics()}catch{};try{await loadPublicData()}catch{};closeModal();
      if(currentUser){toast('Cadastro aprovado e publicado');go('painel');return}
      modal(`<div class="notice">✅ <b>Cadastro aprovado e publicado!</b></div><h2>Você já está na IntegraTrampo</h2><p class="muted">Suas áreas e horários já foram salvos. Não é necessário confirmar o cadastro pelo WhatsApp. A foto é opcional e pode ser adicionada depois pelo painel.</p><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();loginModal()">Entrar no painel</button><button class="btn btn--outline" onclick="closeModal()">Continuar navegando</button></div>`);
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
      const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`${currentUser.id}/perfil-${Date.now()}.${ext}`;
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
        apiGet('it_public_professionals?is_published=eq.true&select=id,display_name,role_title,city,reference_daily,has_transport,availability,work_categories,availability_schedule,rating,review_count,photo_url'),
        apiGet('it_opportunities?status=eq.published&select=id,title,category,city,service_date,start_time,end_time,daily_rate,vacancies,image_url,company_id'),
        apiGet('it_companies?is_published=eq.true&select=id,display_name,kind,city,rating,review_count,logo_url')
      ]);
      if(pr.ok){publicPros=(await pr.json()).map(x=>({id:x.id,name:x.display_name,role:x.role_title,city:x.city,rate:Number(x.reference_daily)||null,rating:Number(x.rating)||0,reviews:x.review_count||0,tags:[...(x.work_categories||[]).slice(0,2),x.has_transport?'Transporte':'Sem transporte',x.availability||'Disponível'],categories:x.work_categories||[],availability_schedule:x.availability_schedule||null,img:x.photo_url||PLACEHOLDER,has_transport:x.has_transport,has_photo:!!x.photo_url}))}
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

  injectRegistrationStyles();
  setTimeout(()=>{try{loadPublicData()}catch{};try{renderOps()}catch{}},100);
})();