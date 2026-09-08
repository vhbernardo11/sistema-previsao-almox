// IntegraTrampo · controles de autoedição v3
// Profissional e contratante editam seus próprios dados. Alterações sensíveis voltam para revisão ADM.
(function(){
  const COMPANY_BUCKET='integratrampo-company-logos';
  const WORK_CATEGORIES=[
    ['🍽️','Garçom'],['🍸','Barman'],['🍳','Auxiliar de cozinha'],['🔥','Churrasqueiro'],['🧹','Diarista'],['🧽','Faxineira'],['⚡','Eletricista'],['🌿','Jardineiro'],['🛡️','Segurança de eventos'],['🚪','Controlador de acesso'],['👁️','Vigia'],['🛡️','Vigilante'],['🎨','Pintor'],['🖌️','Pintor residencial'],['🚰','Encanador'],['🛎️','Recepção'],['🧼','Limpeza de eventos'],['🧰','Serviços gerais'],['•••','Outros']
  ];
  const WEEK=[['mon','Segunda','Seg'],['tue','Terça','Ter'],['wed','Quarta','Qua'],['thu','Quinta','Qui'],['fri','Sexta','Sex'],['sat','Sábado','Sáb'],['sun','Domingo','Dom']];
  let sb=null,currentUser=null,companyFile=null,companyPreviewUrl=null,initialized=false;
  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const tell=m=>typeof toast==='function'?toast(m):alert(m);

  function injectStyles(){
    if($id('itProfileControlsV3Styles'))return;const s=document.createElement('style');s.id='itProfileControlsV3Styles';s.textContent=`
      .pc-chip-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:8px}.pc-chip{display:flex;gap:8px;align-items:center;border:1px solid #dbe4ee;background:#fff;border-radius:13px;padding:9px 10px;font-weight:800;text-align:left;cursor:pointer}.pc-chip.is-selected{border-color:#16B898;background:#ecfdf8;box-shadow:0 0 0 1px #16B898 inset}
      .pc-schedule{display:grid;gap:7px}.pc-schedule-row{display:grid;grid-template-columns:minmax(110px,1fr) 92px 18px 92px;gap:7px;align-items:center;border:1px solid #e2e8f0;border-radius:13px;padding:8px 9px}.pc-schedule-row label{display:flex;gap:7px;align-items:center;font-weight:800}.pc-schedule-row input[type=time]{width:100%;min-width:0;padding:7px 5px;border:1px solid #d7e0e9;border-radius:9px}.pc-schedule-row input[type=time]:disabled{opacity:.45}.pc-quick{display:flex;gap:7px;flex-wrap:wrap;margin:7px 0}.pc-quick button{border:1px solid #dbe4ee;background:#f8fafc;border-radius:999px;padding:7px 10px;font-size:12px;font-weight:800;cursor:pointer}
      .pc-logo-box{border:1px solid #dfe7ef;border-radius:15px;background:#f8fafc;padding:12px;text-align:center}.pc-logo-preview{width:120px;height:120px;object-fit:cover;border-radius:18px;background:#eef2f6;display:block;margin:8px auto}.pc-logo-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap}.pc-logo-actions label{cursor:pointer}.pc-warning{padding:10px 12px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412;font-size:13px;margin:8px 0}
      @media(max-width:560px){.pc-chip-grid{grid-template-columns:1fr 1fr}.pc-schedule-row{grid-template-columns:1fr 76px 12px 76px}.pc-logo-actions .btn{flex:1}}@media(max-width:390px){.pc-chip-grid{grid-template-columns:1fr}}
    `;document.head.appendChild(s);
  }

  async function refreshUser(){if(!sb)sb=window.IntegraTrampoSupabase||null;if(!sb)return null;try{const {data}=await sb.auth.getUser();currentUser=data?.user||null}catch{currentUser=null}return currentUser}
  async function myProfile(){await refreshUser();if(!currentUser)return null;const {data,error}=await sb.from('it_professional_signups').select('id,full_name,whatsapp,email,city,neighborhood,primary_role,work_categories,experience,reference_daily,has_transport,availability,availability_schedule,availability_status,validation_status,profile_photo_url,photo_status,whatsapp_confirmation_status').eq('user_id',currentUser.id).order('created_at',{ascending:false}).limit(1);if(error)throw error;return data?.[0]||null}
  async function myCompany(){await refreshUser();if(!currentUser)return null;const {data,error}=await sb.from('it_companies').select('id,display_name,kind,city,description,logo_url,whatsapp,address,instagram,is_published').eq('user_id',currentUser.id).order('created_at',{ascending:true}).limit(1);if(error)throw error;return data?.[0]||null}

  function categoryHtml(selected=[]){const set=new Set(selected||[]);return WORK_CATEGORIES.map(([icon,name])=>`<button type="button" class="pc-chip ${set.has(name)?'is-selected':''}" data-pc-cat="${esc(name)}" aria-pressed="${set.has(name)}"><span>${icon}</span><span>${esc(name)}</span></button>`).join('')}
  function scheduleHtml(schedule={}){return WEEK.map(([code,label])=>{const row=schedule?.[code]||null,on=!!row,start=row?.start||'08:00',end=row?.end||'18:00';return `<div class="pc-schedule-row" data-pc-day="${code}" data-day-label="${esc(label)}"><label><input type="checkbox" class="pc-day-on" ${on?'checked':''}> ${esc(label)}</label><input class="pc-day-start" type="time" value="${esc(start)}" ${on?'':'disabled'}><span>às</span><input class="pc-day-end" type="time" value="${esc(end)}" ${on?'':'disabled'}></div>`}).join('')}
  function bindProfileEditor(){
    document.querySelectorAll('[data-pc-cat]').forEach(b=>b.onclick=()=>{const on=!b.classList.contains('is-selected');b.classList.toggle('is-selected',on);b.setAttribute('aria-pressed',String(on))});
    document.querySelectorAll('[data-pc-day]').forEach(r=>{const c=r.querySelector('.pc-day-on'),a=r.querySelector('.pc-day-start'),b=r.querySelector('.pc-day-end');c.onchange=()=>{a.disabled=!c.checked;b.disabled=!c.checked}});
    const setDays=codes=>document.querySelectorAll('[data-pc-day]').forEach(r=>{const on=codes.includes(r.dataset.pcDay),c=r.querySelector('.pc-day-on'),a=r.querySelector('.pc-day-start'),b=r.querySelector('.pc-day-end');c.checked=on;a.disabled=!on;b.disabled=!on});
    $id('pcAll')?.addEventListener('click',()=>setDays(WEEK.map(x=>x[0])));$id('pcWeek')?.addEventListener('click',()=>setDays(['mon','tue','wed','thu','fri']));$id('pcWeekend')?.addEventListener('click',()=>setDays(['sat','sun']));$id('pcClear')?.addEventListener('click',()=>setDays([]));
  }
  function readCats(){return [...document.querySelectorAll('[data-pc-cat].is-selected')].map(x=>x.dataset.pcCat).filter(Boolean)}
  function readSchedule(){const schedule={},summary=[];document.querySelectorAll('[data-pc-day]').forEach(r=>{if(!r.querySelector('.pc-day-on')?.checked)return;const code=r.dataset.pcDay,label=r.dataset.dayLabel||code,start=r.querySelector('.pc-day-start')?.value||'08:00',end=r.querySelector('.pc-day-end')?.value||'18:00';schedule[code]={label,start,end};const short=(WEEK.find(x=>x[0]===code)||[])[2]||label;summary.push(`${short} ${start}–${end}${end<start?' (+1 dia)':''}`)});return {schedule,summary:summary.join(' · ')}}

  window.editMyProfile=async function(){
    try{const p=await myProfile();if(!p){if(typeof workerModal==='function')workerModal();return}const selected=(p.work_categories?.length?p.work_categories:[p.primary_role]).filter(Boolean),schedule=p.availability_schedule||{};
      modal(`<div class="notice">✏️ Você controla seus dados. Mudanças em nome, WhatsApp, cidade, áreas ou apresentação voltam para revisão do ADM antes de republicar o perfil.</div><h2>Editar meu cadastro profissional</h2><div class="form-grid">
      <div class="field"><label>Nome completo</label><input id="pcName" value="${esc(p.full_name||'')}"></div><div class="field"><label>WhatsApp</label><input id="pcWhatsapp" inputmode="tel" value="${esc(p.whatsapp||'')}"></div>
      <div class="field full"><label>E-mail da conta</label><input value="${esc(currentUser?.email||p.email||'')}" readonly><div class="small muted">O e-mail de acesso é gerenciado pela conta e não pelo perfil público.</div></div>
      <div class="field"><label>Cidade</label><input id="pcCity" value="${esc(p.city||'Teodoro Sampaio')}"></div><div class="field"><label>Bairro</label><input id="pcNeighborhood" value="${esc(p.neighborhood||'')}"></div>
      <div class="field full"><label>Áreas em que trabalho</label><div class="pc-chip-grid">${categoryHtml(selected)}</div></div>
      <div class="field"><label>Diária de referência</label><input id="pcRate" inputmode="decimal" value="${esc(p.reference_daily??'')}"></div><div class="field"><label>Transporte próprio</label><select id="pcTransport"><option value="false" ${!p.has_transport?'selected':''}>Não</option><option value="true" ${p.has_transport?'selected':''}>Sim</option></select></div>
      <div class="field full"><label>Dias e horários disponíveis</label><div class="pc-quick"><button type="button" id="pcAll">Todos</button><button type="button" id="pcWeek">Seg–Sex</button><button type="button" id="pcWeekend">Fim de semana</button><button type="button" id="pcClear">Limpar</button></div><div class="pc-schedule">${scheduleHtml(schedule)}</div></div>
      <div class="field full"><label>Status de disponibilidade</label><select id="pcAvailabilityStatus"><option value="available_today" ${p.availability_status==='available_today'?'selected':''}>Disponível hoje</option><option value="available_week" ${p.availability_status==='available_week'?'selected':''}>Disponível esta semana</option><option value="unavailable" ${p.availability_status==='unavailable'?'selected':''}>Indisponível</option></select></div>
      <div class="field full"><label>Experiência / apresentação</label><textarea id="pcExperience" maxlength="1200">${esc(p.experience||'')}</textarea></div></div>
      <div class="pc-warning">📸 A troca da foto continua pelo botão <b>Trocar foto</b> no painel e sempre volta para análise do administrador.</div>
      <div class="modal-actions"><button class="btn btn--green" id="pcSaveBtn" onclick="saveMyProfileV3()">Salvar alterações</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);bindProfileEditor();
    }catch(e){console.error(e);tell('Não foi possível abrir seus dados agora')}
  };

  window.saveMyProfileV3=async function(){
    const cats=readCats(),{schedule,summary}=readSchedule(),btn=$id('pcSaveBtn'),name=$id('pcName')?.value.trim()||'',phone=$id('pcWhatsapp')?.value.trim()||'',city=$id('pcCity')?.value.trim()||'';
    if(name.length<2||phone.replace(/\D/g,'').length<10||city.length<2){tell('Revise nome, WhatsApp e cidade');return}if(!cats.length){tell('Selecione pelo menos uma área');return}if(!Object.keys(schedule).length){tell('Marque pelo menos um dia de disponibilidade');return}
    if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{const {data,error}=await sb.rpc('it_update_my_professional_profile_v3',{p_full_name:name,p_whatsapp:phone,p_city:city,p_neighborhood:$id('pcNeighborhood')?.value.trim()||null,p_primary_role:cats[0],p_work_categories:cats,p_experience:$id('pcExperience')?.value.trim()||null,p_reference_daily:$id('pcRate')?.value?Number($id('pcRate').value.replace(',','.')):null,p_has_transport:$id('pcTransport')?.value==='true',p_availability:summary,p_availability_schedule:schedule,p_availability_status:$id('pcAvailabilityStatus')?.value||'available_week'});if(error)throw error;closeModal();tell(data?.requires_review?'Alterações salvas e enviadas para revisão':'Perfil atualizado');if(data?.whatsapp_changed){setTimeout(()=>{const msg=encodeURIComponent('👋 Olá! Alterei meu WhatsApp no cadastro da *IntegraTrampo* e quero confirmar este novo número.');window.open(`https://wa.me/${typeof WA_NUMBER!=='undefined'?WA_NUMBER:'5518981485892'}?text=${msg}`,'_blank')},200)}if(typeof renderPanel==='function')await renderPanel();if(typeof loadPublicData==='function')await loadPublicData();
    }catch(e){console.error(e);tell('Não foi possível salvar as alterações');if(btn){btn.disabled=false;btn.textContent='Salvar alterações'}}
  };
  window.saveMyProfile=window.saveMyProfileV3;

  async function normalizeCompanyImage(file){
    if(!file)return null;if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('invalid_type');if(file.size>10*1024*1024)throw new Error('too_large');
    const info=await new Promise((resolve,reject)=>{const u=URL.createObjectURL(file),img=new Image();img.onload=()=>resolve({u,img,w:img.naturalWidth,h:img.naturalHeight});img.onerror=()=>{URL.revokeObjectURL(u);reject(new Error('invalid_image'))};img.src=u});
    if(info.w<240||info.h<240){URL.revokeObjectURL(info.u);throw new Error('too_small')}
    const max=1600,scale=Math.min(1,max/Math.max(info.w,info.h));if(scale===1&&file.size<=3.5*1024*1024){URL.revokeObjectURL(info.u);return file}
    const canvas=document.createElement('canvas');canvas.width=Math.round(info.w*scale);canvas.height=Math.round(info.h*scale);canvas.getContext('2d',{alpha:false}).drawImage(info.img,0,0,canvas.width,canvas.height);URL.revokeObjectURL(info.u);const blob=await new Promise(r=>canvas.toBlob(r,'image/jpeg',.86));if(!blob)throw new Error('compress_failed');return new File([blob],`empresa-${Date.now()}.jpg`,{type:'image/jpeg',lastModified:Date.now()});
  }
  async function pickCompanyImage(file){try{companyFile=await normalizeCompanyImage(file);if(companyPreviewUrl)URL.revokeObjectURL(companyPreviewUrl);companyPreviewUrl=URL.createObjectURL(companyFile);const img=$id('pcCompanyPreview');if(img){img.src=companyPreviewUrl;img.style.display='block'}tell('Imagem pronta para envio')}catch(e){companyFile=null;tell(e.message==='too_small'?'Use uma imagem com pelo menos 240×240 px.':e.message==='too_large'?'A imagem é grande demais.':'Não foi possível usar essa imagem.')}}

  window.openMyCompanyProfile=async function(){
    await refreshUser();if(!currentUser){if(typeof loginModal==='function')loginModal();return}
    try{const c=await myCompany();companyFile=null;if(companyPreviewUrl){URL.revokeObjectURL(companyPreviewUrl);companyPreviewUrl=null}
      modal(`<div class="notice">🏢 Você pode editar seu cadastro. Ao salvar, a empresa volta para revisão e só o ADM pode publicar novamente.</div><h2>${c?'Editar meu cadastro de contratante':'Criar cadastro de contratante'}</h2><div class="form-grid">
      <div class="field"><label>Nome / empresa</label><input id="pcCompanyName" value="${esc(c?.display_name||'')}"></div><div class="field"><label>Tipo</label><input id="pcCompanyKind" value="${esc(c?.kind||'Empresa local')}" placeholder="Restaurante, bar, pessoa física..."></div>
      <div class="field"><label>WhatsApp</label><input id="pcCompanyWhatsapp" inputmode="tel" value="${esc(c?.whatsapp||'')}"></div><div class="field"><label>Instagram</label><input id="pcCompanyInstagram" value="${esc(c?.instagram||'')}" placeholder="@empresa"></div>
      <div class="field full"><label>Cidade</label><input id="pcCompanyCity" value="${esc(c?.city||'Teodoro Sampaio')}"></div><div class="field full"><label>Endereço</label><input id="pcCompanyAddress" value="${esc(c?.address||'')}"></div>
      <div class="field full"><label>Sobre</label><textarea id="pcCompanyDesc" maxlength="1200">${esc(c?.description||'')}</textarea></div>
      <div class="field full"><label>Logo ou foto de identificação</label><div class="pc-logo-box"><img id="pcCompanyPreview" class="pc-logo-preview" src="${esc(c?.logo_url||'')}" style="${c?.logo_url?'':'display:none'}" alt="Prévia"><div class="pc-logo-actions"><label for="pcCompanyCamera" class="btn btn--navy">📷 Tirar foto</label><label for="pcCompanyGallery" class="btn btn--outline">🖼️ Escolher imagem</label></div><input id="pcCompanyCamera" type="file" accept="image/*" capture="environment" style="display:none"><input id="pcCompanyGallery" type="file" accept="image/jpeg,image/png,image/webp" style="display:none"><div class="small muted" style="margin-top:8px">Obrigatório para envio à revisão. Se já existe uma imagem, ela será mantida até você escolher outra.</div></div></div></div>
      <div class="pc-warning">${c?.is_published?'Seu perfil está publicado agora. Ao salvar qualquer alteração, ele sai do ar e volta para revisão.':'Seu perfil só ficará público depois da aprovação do administrador.'}</div>
      <div class="modal-actions"><button class="btn btn--orange" id="pcCompanySaveBtn" onclick="saveMyCompanyProfileV3()">Salvar e enviar para revisão</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
      $id('pcCompanyCamera')?.addEventListener('change',e=>pickCompanyImage(e.target.files?.[0]));$id('pcCompanyGallery')?.addEventListener('change',e=>pickCompanyImage(e.target.files?.[0]));
    }catch(e){console.error(e);tell('Não foi possível carregar o cadastro da empresa')}
  };

  window.saveMyCompanyProfileV3=async function(){
    const btn=$id('pcCompanySaveBtn'),name=$id('pcCompanyName')?.value.trim()||'',city=$id('pcCompanyCity')?.value.trim()||'';if(name.length<2||city.length<2){tell('Preencha nome e cidade');return}
    if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{const existing=await myCompany();let logo=existing?.logo_url||null;if(companyFile){if(btn)btn.textContent='Enviando imagem...';const ext=companyFile.type==='image/png'?'png':companyFile.type==='image/webp'?'webp':'jpg',path=`${currentUser.id}/logo-${Date.now()}.${ext}`;const {error:uErr}=await sb.storage.from(COMPANY_BUCKET).upload(path,companyFile,{contentType:companyFile.type,cacheControl:'3600',upsert:false});if(uErr)throw uErr;logo=sb.storage.from(COMPANY_BUCKET).getPublicUrl(path).data.publicUrl}if(!logo)throw new Error('company_visual_required');if(btn)btn.textContent='Gravando dados...';const {error}=await sb.rpc('it_save_my_company_v2_user',{p_display_name:name,p_kind:$id('pcCompanyKind')?.value.trim()||null,p_city:city,p_description:$id('pcCompanyDesc')?.value.trim()||null,p_logo_url:logo,p_whatsapp:$id('pcCompanyWhatsapp')?.value.trim()||null,p_address:$id('pcCompanyAddress')?.value.trim()||null,p_instagram:$id('pcCompanyInstagram')?.value.trim()||null});if(error)throw error;closeModal();tell('Cadastro salvo e enviado para revisão');if(typeof renderPanel==='function')await renderPanel();if(typeof loadPublicData==='function')await loadPublicData();
    }catch(e){console.error(e);tell(String(e.message||'').includes('company_visual_required')?'Adicione uma foto ou logo antes de enviar.':'Não foi possível salvar o cadastro da empresa');if(btn){btn.disabled=false;btn.textContent='Salvar e enviar para revisão'}}
  };
  window.saveMyCompanyProfile=window.saveMyCompanyProfileV3;

  async function init(){if(initialized)return;initialized=true;injectStyles();for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;if(!sb)return;await refreshUser();sb.auth.onAuthStateChange((_,session)=>{currentUser=session?.user||null})}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();