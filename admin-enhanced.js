// IntegraTrampo · Controles ADM avançados
// Edição operacional + upload de imagens direto para Supabase Storage/Database.
(function(){
  const SESSION_KEY='integratrampo_admin_session_v1';
  const PROJECT_URL='https://ghspaqawzfqtsxibgqxy.supabase.co';
  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const token=()=>{try{return sessionStorage.getItem(SESSION_KEY)||''}catch{return ''}};
  const sb=()=>window.IntegraTrampoSupabase||null;
  const tell=m=>typeof toast==='function'?toast(m):alert(m);

  async function rpc(name,args={}){
    const client=sb(),t=token();
    if(!client||!t)throw new Error('Sessão ADM indisponível');
    const {data,error}=await client.rpc(name,{p_token:t,...args});
    if(error)throw error;
    return data;
  }

  async function adminData(){return await rpc('it_admin_dashboard_data')}

  async function uploadImage(kind,file){
    if(!file)return null;
    if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('Use JPG, PNG ou WebP.');
    if(file.size>5*1024*1024)throw new Error('A imagem deve ter no máximo 5 MB.');
    const fd=new FormData();fd.append('token',token());fd.append('kind',kind);fd.append('file',file,file.name);
    const r=await fetch(`${PROJECT_URL}/functions/v1/integratrampo-admin-media`,{method:'POST',body:fd});
    let body={};try{body=await r.json()}catch{}
    if(!r.ok||!body.url)throw new Error(body.error||'Falha no upload');
    return body.url;
  }

  function setPreview(inputId,previewId){
    const input=$id(inputId),img=$id(previewId);if(!input||!img)return;
    input.onchange=()=>{const f=input.files?.[0];if(f){img.src=URL.createObjectURL(f);img.style.display='block'}};
  }

  window.adminCompanyModal=async function(id){
    try{
      const d=await adminData(),c=(d.companies||[]).find(x=>x.id===id)||null;
      modal(`<div class="notice">💾 <b>Alterações salvas diretamente no Supabase.</b> Você pode enviar uma imagem do celular ou computador.</div>
        <h2>${c?'Editar contratante':'Novo contratante'}</h2><div class="form-grid">
        <div class="field full"><label>Nome</label><input id="aceName" value="${esc(c?.display_name||'')}"></div>
        <div class="field"><label>Tipo</label><input id="aceKind" value="${esc(c?.kind||'Empresa')}"></div>
        <div class="field"><label>Cidade</label><input id="aceCity" value="${esc(c?.city||'Teodoro Sampaio')}"></div>
        <div class="field"><label>WhatsApp</label><input id="aceWhatsapp" inputmode="tel" value="${esc(c?.whatsapp||'')}"></div>
        <div class="field"><label>Instagram</label><input id="aceInstagram" value="${esc(c?.instagram||'')}"></div>
        <div class="field full"><label>Endereço</label><input id="aceAddress" value="${esc(c?.address||'')}"></div>
        <div class="field full"><label>Descrição</label><textarea id="aceDesc">${esc(c?.description||'')}</textarea></div>
        <div class="field full"><label>Logo / foto da empresa</label><input id="aceLogoFile" type="file" accept="image/jpeg,image/png,image/webp"><div class="small muted">JPG, PNG ou WebP · máximo 5 MB.</div>${c?.logo_url?`<img id="aceLogoPreview" src="${esc(c.logo_url)}" style="display:block;max-width:180px;max-height:130px;object-fit:contain;margin-top:8px;border-radius:12px">`:`<img id="aceLogoPreview" style="display:none;max-width:180px;max-height:130px;object-fit:contain;margin-top:8px;border-radius:12px">`}</div>
        <div class="field full"><label>Ou URL da imagem</label><input id="aceLogoUrl" type="url" value="${esc(c?.logo_url||'')}" placeholder="https://..."></div>
        <div class="field full"><label><input id="acePublish" type="checkbox" ${c?.is_published?'checked':''}> Publicar agora</label></div>
        <input id="aceUser" type="hidden" value="${esc(c?.user_id||'')}"></div>
        <div class="modal-actions"><button class="btn btn--green" id="aceSaveBtn" onclick="adminSaveCompanyEnhanced('${c?.id||''}')">Salvar direto no Supabase</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
      setPreview('aceLogoFile','aceLogoPreview');
    }catch(e){console.error(e);tell('Não foi possível abrir a edição do contratante.')}
  };

  window.adminSaveCompanyEnhanced=async function(id){
    const btn=$id('aceSaveBtn');if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{
      let logo=$id('aceLogoUrl').value.trim();const file=$id('aceLogoFile').files?.[0];
      if(file){if(btn)btn.textContent='Enviando imagem...';logo=await uploadImage('company',file)}
      if(btn)btn.textContent='Gravando dados...';
      await rpc('it_admin_save_company_v2',{
        p_id:id||null,p_display_name:$id('aceName').value.trim(),p_kind:$id('aceKind').value.trim(),p_city:$id('aceCity').value.trim(),
        p_description:$id('aceDesc').value.trim(),p_logo_url:logo,p_whatsapp:$id('aceWhatsapp').value.trim(),p_address:$id('aceAddress').value.trim(),
        p_instagram:$id('aceInstagram').value.trim(),p_user_id:$id('aceUser').value||null,p_publish:$id('acePublish').checked
      });
      closeModal();tell('Contratante atualizado no Supabase');if(window.adminRefresh)await window.adminRefresh();
    }catch(e){console.error(e);tell(e.message||'Não foi possível salvar.');if(btn){btn.disabled=false;btn.textContent='Salvar direto no Supabase'}}
  };

  window.adminOpportunityModal=async function(id){
    try{
      const d=await adminData(),o=(d.opportunities||[]).find(x=>x.id===id)||null,companies=d.companies||[];
      modal(`<div class="notice">💾 <b>Esta edição grava diretamente no Supabase.</b> Horários, escala, valor, foto e status ficam centralizados no banco.</div>
        <h2>${o?'Editar vaga':'Nova vaga'}</h2><div class="form-grid">
        <div class="field full"><label>Contratante</label><select id="aoeCompany"><option value="">Selecione</option>${companies.map(c=>`<option value="${c.id}" ${o?.company_id===c.id?'selected':''}>${esc(c.display_name)}${c.is_published?' · publicado':' · não publicado'}</option>`).join('')}</select></div>
        <div class="field full"><label>Título</label><input id="aoeTitle" value="${esc(o?.title||'')}"></div>
        <div class="field"><label>Categoria</label><input id="aoeCat" value="${esc(o?.category||'')}"></div>
        <div class="field"><label>Cidade</label><input id="aoeCity" value="${esc(o?.city||'Teodoro Sampaio')}"></div>
        <div class="field full"><label>Dias / escala</label><input id="aoeDays" value="${esc(o?.schedule_days||'')}" placeholder="Ex.: Segunda a sábado"></div>
        <div class="field"><label>Data específica (opcional)</label><input id="aoeDate" type="date" value="${esc(o?.service_date||'')}"></div>
        <div class="field"><label>Vagas</label><input id="aoeVac" type="number" min="1" value="${Number(o?.vacancies||1)}"></div>
        <div class="field"><label>Horário inicial</label><input id="aoeStart" type="time" value="${esc((o?.start_time||'').slice(0,5))}"></div>
        <div class="field"><label>Horário final</label><input id="aoeEnd" type="time" value="${esc((o?.end_time||'').slice(0,5))}"></div>
        <div class="field"><label>Valor da diária</label><input id="aoeRate" inputmode="decimal" value="${esc(o?.daily_rate??'')}" placeholder="Vazio = a combinar"></div>
        <div class="field"><label>Status</label><select id="aoeStatus"><option value="draft" ${!o||o.status==='draft'?'selected':''}>Rascunho</option><option value="published" ${o?.status==='published'?'selected':''}>Publicada</option><option value="filled" ${o?.status==='filled'?'selected':''}>Preenchida</option><option value="cancelled" ${o?.status==='cancelled'?'selected':''}>Cancelada</option><option value="completed" ${o?.status==='completed'?'selected':''}>Concluída</option></select></div>
        <div class="field full"><label>Descrição</label><textarea id="aoeDesc">${esc(o?.description||'')}</textarea></div>
        <div class="field full"><label>Foto / arte da vaga</label><input id="aoeImageFile" type="file" accept="image/jpeg,image/png,image/webp"><div class="small muted">JPG, PNG ou WebP · máximo 5 MB.</div>${o?.image_url?`<img id="aoeImagePreview" src="${esc(o.image_url)}" style="display:block;max-width:220px;max-height:160px;object-fit:cover;margin-top:8px;border-radius:12px">`:`<img id="aoeImagePreview" style="display:none;max-width:220px;max-height:160px;object-fit:cover;margin-top:8px;border-radius:12px">`}</div>
        <div class="field full"><label>Ou URL da imagem</label><input id="aoeImageUrl" type="url" value="${esc(o?.image_url||'')}" placeholder="https://..."></div></div>
        <div class="modal-actions"><button class="btn btn--green" id="aoeSaveBtn" onclick="adminSaveOpportunityEnhanced('${o?.id||''}')">Salvar direto no Supabase</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
      setPreview('aoeImageFile','aoeImagePreview');
    }catch(e){console.error(e);tell('Não foi possível abrir a edição da vaga.')}
  };

  window.adminSaveOpportunityEnhanced=async function(id){
    const btn=$id('aoeSaveBtn');if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{
      let image=$id('aoeImageUrl').value.trim();const file=$id('aoeImageFile').files?.[0];
      if(file){if(btn)btn.textContent='Enviando imagem...';image=await uploadImage('opportunity',file)}
      const rate=$id('aoeRate').value.trim();if(btn)btn.textContent='Gravando dados...';
      await rpc('it_admin_save_opportunity_v2',{
        p_id:id||null,p_company_id:$id('aoeCompany').value||null,p_title:$id('aoeTitle').value.trim(),p_category:$id('aoeCat').value.trim(),
        p_description:$id('aoeDesc').value.trim(),p_city:$id('aoeCity').value.trim(),p_service_date:$id('aoeDate').value||null,
        p_schedule_days:$id('aoeDays').value.trim(),p_start_time:$id('aoeStart').value||null,p_end_time:$id('aoeEnd').value||null,
        p_daily_rate:rate?Number(rate.replace(',','.')):null,p_vacancies:Number($id('aoeVac').value||1),p_image_url:image,p_status:$id('aoeStatus').value
      });
      closeModal();tell('Vaga atualizada no Supabase');if(window.adminRefresh)await window.adminRefresh();
    }catch(e){console.error(e);tell(e.message||'Não foi possível salvar.');if(btn){btn.disabled=false;btn.textContent='Salvar direto no Supabase'}}
  };

  window.adminProfessionalEditModal=async function(id){
    try{
      const d=await adminData(),p=(d.professionals||[]).find(x=>x.id===id);if(!p)throw new Error('Cadastro não encontrado');
      modal(`<div class="notice">👤 <b>Edição administrativa do profissional.</b> As alterações vão direto para o Supabase e, se o perfil já existir publicamente, os dados básicos também são sincronizados.</div>
        <h2>Editar profissional</h2><div class="form-grid">
        <div class="field full"><label>Nome completo</label><input id="apeName" value="${esc(p.full_name||'')}"></div>
        <div class="field"><label>WhatsApp</label><input id="apeWhatsapp" inputmode="tel" value="${esc(p.whatsapp||'')}"></div>
        <div class="field"><label>E-mail</label><input id="apeEmail" type="email" value="${esc(p.email||'')}"></div>
        <div class="field"><label>Cidade</label><input id="apeCity" value="${esc(p.city||'Teodoro Sampaio')}"></div>
        <div class="field"><label>Área principal</label><input id="apeRole" value="${esc(p.primary_role||'')}"></div>
        <div class="field"><label>Diária de referência</label><input id="apeRate" inputmode="decimal" value="${esc(p.reference_daily??'')}" placeholder="Vazio = a combinar"></div>
        <div class="field"><label>Transporte próprio</label><select id="apeTransport"><option value="false" ${!p.has_transport?'selected':''}>Não</option><option value="true" ${p.has_transport?'selected':''}>Sim</option></select></div>
        <div class="field full"><label>Disponibilidade</label><input id="apeAvailability" value="${esc(p.availability||'')}"></div>
        <div class="field full"><label>Experiência</label><textarea id="apeExperience">${esc(p.experience||'')}</textarea></div>
        <div class="field full"><label>Foto do profissional</label><input id="apePhotoFile" type="file" accept="image/jpeg,image/png,image/webp"><div class="small muted">Se o ADM enviar uma nova foto, ela é registrada como aprovada.</div>${p.profile_photo_url?`<img id="apePhotoPreview" src="${esc(p.profile_photo_url)}" style="display:block;width:120px;height:120px;object-fit:cover;margin-top:8px;border-radius:16px">`:`<img id="apePhotoPreview" style="display:none;width:120px;height:120px;object-fit:cover;margin-top:8px;border-radius:16px">`}</div></div>
        <div class="modal-actions"><button class="btn btn--green" id="apeSaveBtn" onclick="adminSaveProfessionalEnhanced('${p.id}')">Salvar direto no Supabase</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
      setPreview('apePhotoFile','apePhotoPreview');
    }catch(e){console.error(e);tell('Não foi possível abrir o profissional.')}
  };

  window.adminSaveProfessionalEnhanced=async function(id){
    const btn=$id('apeSaveBtn');if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{
      let photo='';const file=$id('apePhotoFile').files?.[0];if(file){if(btn)btn.textContent='Enviando foto...';photo=await uploadImage('professional',file)}
      const rate=$id('apeRate').value.trim();if(btn)btn.textContent='Gravando dados...';
      await rpc('it_admin_save_professional_v2',{
        p_signup_id:id,p_full_name:$id('apeName').value.trim(),p_whatsapp:$id('apeWhatsapp').value.trim(),p_email:$id('apeEmail').value.trim(),
        p_city:$id('apeCity').value.trim(),p_primary_role:$id('apeRole').value.trim(),p_experience:$id('apeExperience').value.trim(),
        p_reference_daily:rate?Number(rate.replace(',','.')):null,p_has_transport:$id('apeTransport').value==='true',p_availability:$id('apeAvailability').value.trim(),p_photo_url:photo
      });
      closeModal();tell('Profissional atualizado no Supabase');if(window.adminRefresh)await window.adminRefresh();
    }catch(e){console.error(e);tell(e.message||'Não foi possível salvar.');if(btn){btn.disabled=false;btn.textContent='Salvar direto no Supabase'}}
  };

  function enhanceProfessionalCards(){
    document.querySelectorAll('#screen-operacao .admin-card .admin-actions').forEach(actions=>{
      if(actions.querySelector('[data-admin-edit-professional]'))return;
      const source=[...actions.querySelectorAll('button')].find(b=>(b.getAttribute('onclick')||'').includes('adminProfessionalAction'));
      if(!source)return;const m=(source.getAttribute('onclick')||'').match(/adminProfessionalAction\('([^']+)'/);if(!m)return;
      const b=document.createElement('button');b.type='button';b.className='btn btn--outline';b.dataset.adminEditProfessional='1';b.textContent='✏️ Editar dados/foto';b.onclick=()=>window.adminProfessionalEditModal(m[1]);actions.prepend(b);
    });
    const note=document.querySelector('#screen-operacao .system-note');if(note&&!note.dataset.directSupabase){note.dataset.directSupabase='1';note.insertAdjacentHTML('beforeend',' · 💾 edição e imagens gravam direto no Supabase');}
  }

  const observer=new MutationObserver(()=>setTimeout(enhanceProfessionalCards,30));
  observer.observe(document.documentElement,{subtree:true,childList:true});
  setTimeout(enhanceProfessionalCards,300);
})();
