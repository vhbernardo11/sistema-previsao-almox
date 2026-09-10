// IntegraTrampo · Etapa 4 · conclusão bilateral + avaliação + reputação
(function(){
  if(window.IntegraTrampoStage4)return;

  let sb=null;
  let renderBusy=false;
  let renderTimer=null;
  let selectedRating=0;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const toastMsg=m=>typeof window.toast==='function'?window.toast(m):alert(m);

  function injectStyles(){
    if(document.getElementById('integratrampoStage4Styles'))return;
    const s=document.createElement('style');
    s.id='integratrampoStage4Styles';
    s.textContent=`
      .it-stage4{margin-top:12px;border:1px solid #dfe7ef;border-radius:16px;background:linear-gradient(180deg,#fbfdff,#fff);padding:13px}
      .it-stage4__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage4__head b{color:#0D1B2A}.it-stage4__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#edf4ff;color:#285b8f}
      .it-stage4__steps{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:7px;margin-top:10px}.it-stage4__step{border-radius:11px;background:#f4f7fa;padding:8px;font-size:11px;color:#677380}.it-stage4__step strong{display:block;color:#0D1B2A;margin-bottom:2px}.it-stage4__step.is-done{background:#eafaf4;color:#087858}.it-stage4__step.is-done strong{color:#087858}
      .it-stage4__parties{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:10px}.it-stage4__party{border-radius:12px;background:#f5f7fa;padding:9px 10px;font-size:12px}.it-stage4__party.is-done{background:#eafaf4;color:#087858}.it-stage4__party b{display:block;margin-bottom:2px}
      .it-stage4__actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:10px}.it-stage4__actions .btn{padding:8px 11px}.it-stage4__note{font-size:12px;color:#687481;margin-top:9px}
      .it-rating-picker{display:flex;gap:7px;justify-content:center;margin:18px 0 8px}.it-rating-star{border:0;background:transparent;font-size:36px;line-height:1;cursor:pointer;padding:2px;filter:grayscale(1);opacity:.45}.it-rating-star.is-on{filter:none;opacity:1;transform:translateY(-1px)}.it-rating-label{text-align:center;font-weight:800;color:#0D1B2A;min-height:22px}
      @media(max-width:620px){.it-stage4__steps{grid-template-columns:1fr 1fr}.it-stage4__actions .btn{flex:1}}
      @media(max-width:390px){.it-stage4__parties{grid-template-columns:1fr}}
    `;
    document.head.appendChild(s);
  }

  async function waitForSupabase(){
    for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);
    sb=window.IntegraTrampoSupabase||null;
    return sb;
  }

  async function rpc(name,args={}){
    if(!sb)await waitForSupabase();
    if(!sb)throw new Error('supabase_unavailable');
    const {data,error}=await sb.rpc(name,args);
    if(error)throw error;
    return data;
  }

  function scheduleRender(delay=120){
    clearTimeout(renderTimer);
    renderTimer=setTimeout(()=>renderCloseout().catch(e=>console.warn('[Stage4 render]',e)),delay);
  }

  function stepHtml(label,done,icon){
    return `<div class="it-stage4__step ${done?'is-done':''}"><strong>${done?'✅':icon} ${esc(label)}</strong>${done?'Concluído':'Pendente'}</div>`;
  }

  function closeoutHtml(m,review){
    if(m.status==='cancelled')return '';
    const confirmed=!!m.professional_confirmed_at&&!!m.company_confirmed_at;
    const proDone=!!m.professional_completed_at;
    const companyDone=!!m.company_completed_at;
    const completed=m.status==='completed'&&!!m.completed_at;
    const viewerDone=m.viewer_side==='professional'?proDone:companyDone;
    const counterpartDone=m.viewer_side==='professional'?companyDone:proDone;
    const reviewed=!!review;

    let action='';
    if(confirmed&&!viewerDone&&!completed){
      action=`<button type="button" class="btn btn--green" onclick="completeMyService('${esc(m.service_id)}')">✅ Marcar meu lado como concluído</button>`;
    }else if(confirmed&&viewerDone&&!completed){
      action='<button type="button" class="btn btn--outline" disabled>⏳ Aguardando a outra parte concluir</button>';
    }else if(completed&&!reviewed){
      action=`<button type="button" class="btn btn--navy" onclick="reviewService('${esc(m.service_id)}','${esc(m.viewer_side)}')">⭐ Avaliar experiência</button>`;
    }

    const reviewState=review
      ? `<div class="it-stage4__note">⭐ Sua nota: <b>${Number(review.rating)}/5</b> · ${review.is_published?'avaliação publicada':'aguardando moderação antes de entrar na reputação pública'}.</div>`
      : completed?'<div class="it-stage4__note">A avaliação é bilateral. Cada lado avalia separadamente e a nota pública só muda após moderação.</div>':'';

    return `<section class="it-stage4" data-stage4-for="${esc(m.service_id)}">
      <div class="it-stage4__head"><b>🏁 Fechamento do serviço</b><span class="it-stage4__badge">ETAPA 4</span></div>
      <div class="it-stage4__steps">
        ${stepHtml('Match',true,'🤝')}
        ${stepHtml('Confirmado',confirmed,'✅')}
        ${stepHtml('Concluído',completed,'🏁')}
        ${stepHtml('Avaliado',reviewed,'⭐')}
      </div>
      ${confirmed?`<div class="it-stage4__parties"><div class="it-stage4__party ${proDone?'is-done':''}"><b>${proDone?'✅':'⏳'} Profissional</b>${proDone?'marcou o serviço como concluído':'ainda não marcou a conclusão'}</div><div class="it-stage4__party ${companyDone?'is-done':''}"><b>${companyDone?'✅':'⏳'} Contratante</b>${companyDone?'marcou o serviço como concluído':'ainda não marcou a conclusão'}</div></div>`:''}
      ${counterpartDone&&!viewerDone&&!completed?'<div class="it-stage4__note">A outra parte já concluiu. Falta somente a sua confirmação de conclusão.</div>':''}
      ${action?`<div class="it-stage4__actions">${action}</div>`:''}
      ${reviewState}
    </section>`;
  }

  async function currentReviews(userId){
    const map=new Map();
    if(!userId)return map;
    const {data,error}=await sb.from('it_reviews').select('service_id,rating,comment,is_published,created_at').eq('reviewer_user_id',userId);
    if(error)throw error;
    (data||[]).forEach(r=>map.set(String(r.service_id),r));
    return map;
  }

  async function renderCloseout(){
    if(renderBusy)return;
    renderBusy=true;
    try{
      injectStyles();
      if(!sb)await waitForSupabase();
      if(!sb)return;
      const {data:{user}}=await sb.auth.getUser();
      if(!user)return;
      const matchApi=window.IntegraTrampoMatchV9;
      if(!matchApi)return;
      let matches=matchApi.matches||[];
      if(!matches.length)matches=await matchApi.fetchMatches();
      const reviews=await currentReviews(user.id);
      (matches||[]).forEach(m=>{
        const card=document.querySelector(`[data-match-service="${CSS.escape(String(m.service_id))}"]`);
        if(!card)return;
        card.querySelector(`[data-stage4-for="${CSS.escape(String(m.service_id))}"]`)?.remove();
        const html=closeoutHtml(m,reviews.get(String(m.service_id)));
        if(!html)return;
        const lastActions=card.querySelector(':scope > .it-match-actions:last-child');
        if(lastActions)lastActions.insertAdjacentHTML('beforebegin',html);else card.insertAdjacentHTML('beforeend',html);
      });
    }finally{renderBusy=false}
  }

  function completionFriendly(e){
    const m=String(e?.message||e||'');
    if(m.includes('service_not_confirmed'))return 'O serviço precisa estar confirmado pelas duas partes antes da conclusão.';
    if(m.includes('service_not_accessible'))return 'Esse serviço não pertence à sua conta.';
    if(m.includes('service_not_found'))return 'Não foi possível localizar o serviço.';
    return 'Não foi possível registrar a conclusão agora.';
  }

  window.completeMyService=function(serviceId){
    const match=(window.IntegraTrampoMatchV9?.matches||[]).find(x=>String(x.service_id)===String(serviceId));
    const title=match?.job_title||'este serviço';
    if(typeof window.modal!=='function')return window.completeMyServiceStage4(serviceId);
    window.modal(`<div class="notice">🏁 Esta confirmação é individual. O serviço só será encerrado quando as duas partes marcarem como concluído.</div><h2>Concluir serviço?</h2><p class="muted">${esc(title)}</p><div class="modal-actions"><button type="button" class="btn btn--green" id="stage4CompleteBtn" onclick="completeMyServiceStage4('${esc(serviceId)}')">Sim, meu lado foi concluído</button><button type="button" class="btn btn--outline" onclick="closeModal()">Voltar</button></div>`);
  };

  window.completeMyServiceStage4=async function(serviceId){
    const btn=document.getElementById('stage4CompleteBtn');
    if(btn){btn.disabled=true;btn.textContent='Registrando...'}
    try{
      await rpc('it_complete_my_service',{p_service_id:serviceId});
      if(typeof window.closeModal==='function')window.closeModal();
      toastMsg('Conclusão registrada. Agora aguardamos a outra parte, se necessário.');
      if(typeof window.renderPanel==='function')await window.renderPanel();
      if(window.IntegraTrampoMatchV9?.render)await window.IntegraTrampoMatchV9.render();
      scheduleRender(80);
    }catch(e){
      console.error('[Stage4 complete]',e);
      toastMsg(completionFriendly(e));
      if(btn){btn.disabled=false;btn.textContent='Tentar novamente'}
    }
  };

  const ratingText=n=>({1:'Muito ruim',2:'Ruim',3:'Regular',4:'Boa experiência',5:'Excelente experiência'}[n]||'Escolha de 1 a 5 estrelas');

  window.stage4PickRating=function(n){
    selectedRating=Number(n)||0;
    document.querySelectorAll('#stage4RatingPicker .it-rating-star').forEach((b,i)=>b.classList.toggle('is-on',i<selectedRating));
    const label=document.getElementById('stage4RatingLabel');if(label)label.textContent=ratingText(selectedRating);
    const submit=document.getElementById('stage4ReviewSubmit');if(submit)submit.disabled=!selectedRating;
  };

  window.reviewService=function(serviceId,side){
    selectedRating=0;
    const match=(window.IntegraTrampoMatchV9?.matches||[]).find(x=>String(x.service_id)===String(serviceId));
    const other=side==='professional'?(match?.company_name||'contratante'):(match?.professional_name||'profissional');
    if(typeof window.modal!=='function')return;
    window.modal(`<div class="notice">⭐ Avalie somente o serviço realizado. A publicação passa por moderação para proteger os dois lados.</div><h2>Avaliar ${esc(other)}</h2><div id="stage4RatingPicker" class="it-rating-picker">${[1,2,3,4,5].map(n=>`<button type="button" class="it-rating-star" aria-label="${n} estrela${n>1?'s':''}" onclick="stage4PickRating(${n})">★</button>`).join('')}</div><div id="stage4RatingLabel" class="it-rating-label">Escolha de 1 a 5 estrelas</div><div class="field" style="margin-top:14px"><label>Comentário (opcional)</label><textarea id="stage4ReviewComment" maxlength="1000" placeholder="Conte como foi a experiência, sem expor dados pessoais."></textarea></div><div class="modal-actions"><button type="button" class="btn btn--navy" id="stage4ReviewSubmit" disabled onclick="submitStage4Review('${esc(serviceId)}')">Enviar avaliação</button><button type="button" class="btn btn--outline" onclick="closeModal()">Agora não</button></div>`);
  };

  window.submitStage4Review=async function(serviceId){
    if(selectedRating<1||selectedRating>5){toastMsg('Escolha de 1 a 5 estrelas.');return}
    const btn=document.getElementById('stage4ReviewSubmit');
    const comment=document.getElementById('stage4ReviewComment')?.value.trim()||null;
    if(btn){btn.disabled=true;btn.textContent='Enviando...'}
    try{
      await rpc('it_submit_my_review_v1',{p_service_id:serviceId,p_rating:selectedRating,p_comment:comment});
      if(typeof window.closeModal==='function')window.closeModal();
      toastMsg('Avaliação recebida. Ela ficará em moderação antes de compor a reputação pública.');
      if(typeof window.renderPanel==='function')await window.renderPanel();
      if(window.IntegraTrampoMatchV9?.render)await window.IntegraTrampoMatchV9.render();
      scheduleRender(80);
    }catch(e){
      console.error('[Stage4 review]',e);
      const m=String(e?.message||'');
      if(m.includes('review_already_submitted'))toastMsg('Você já avaliou este serviço.');
      else if(m.includes('service_not_completed'))toastMsg('As duas partes precisam concluir o serviço antes da avaliação.');
      else toastMsg('Não foi possível enviar a avaliação agora.');
      if(btn){btn.disabled=false;btn.textContent='Enviar avaliação'}
    }
  };

  async function init(){
    injectStyles();
    await waitForSupabase();
    for(let i=0;i<80&&!window.IntegraTrampoMatchV9;i++)await wait(80);
    const root=document.getElementById('screen-painel')||document.body;
    const observer=new MutationObserver(()=>scheduleRender(100));
    observer.observe(root,{childList:true,subtree:true});
    if(document.getElementById('screen-painel')?.classList.contains('is-active')&&typeof window.renderPanel==='function'){
      try{await window.renderPanel()}catch{}
    }
    if(window.IntegraTrampoMatchV9?.render){try{await window.IntegraTrampoMatchV9.render()}catch{}}
    scheduleRender(100);
  }

  window.IntegraTrampoStage4={version:1,stage:4,render:renderCloseout};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
