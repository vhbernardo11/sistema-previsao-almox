// IntegraTrampo · Match etapa 1 v9
// Mostra a contratação criada após a seleção para profissional e contratante.
// Esta etapa NÃO envia WhatsApp, NÃO adiciona pagamento e NÃO altera a confirmação do serviço.
(function(){
  if(window.IntegraTrampoMatchV9)return;

  let sb=null;
  let matches=[];
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const money=v=>v===null||v===undefined||v===''?'A combinar':`R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:0,maximumFractionDigits:2})}`;
  const fmtDate=v=>{if(!v)return 'A combinar';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(String(v).length===10?v+'T12:00:00':v))}catch{return String(v)}};
  const fmtTime=v=>v?String(v).slice(0,5):'A combinar';
  const statusLabel=v=>({awaiting_confirmation:'Match realizado',confirmed:'Serviço confirmado',completed:'Serviço concluído',cancelled:'Cancelado'}[v]||v||'Match realizado');

  function injectStyles(){
    if($id('integratrampoMatchV9Styles'))return;
    const s=document.createElement('style');s.id='integratrampoMatchV9Styles';s.textContent=`
      .it-match-stage{margin:0 0 18px}.it-match-stage__head{display:flex;align-items:flex-end;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:10px}.it-match-stage__head h3{margin:0}.it-match-stage__head p{margin:3px 0 0}
      .it-match-card{overflow:hidden;border:1px solid #cfe9df;background:linear-gradient(180deg,#f0fff9 0,#fff 48%);border-radius:20px;padding:16px;margin-bottom:11px;box-shadow:0 10px 26px rgba(13,27,42,.06)}
      .it-match-top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start;flex-wrap:wrap}.it-match-badge{display:inline-flex;align-items:center;gap:6px;background:#0D1B2A;color:#fff;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900}.it-match-status{display:inline-flex;align-items:center;gap:5px;background:#e7fbf3;color:#087858;border-radius:999px;padding:6px 10px;font-size:12px;font-weight:900}
      .it-match-people{display:grid;grid-template-columns:1fr auto 1fr;gap:12px;align-items:center;margin:16px 0}.it-match-person{display:flex;align-items:center;gap:10px;min-width:0}.it-match-person img,.it-match-avatar{width:54px;height:54px;border-radius:15px;object-fit:cover;background:#edf2f7;border:1px solid #dde5ed}.it-match-avatar{display:grid;place-items:center;font-size:23px}.it-match-person b{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.it-match-person span{display:block;font-size:12px;color:#66717d;margin-top:2px}.it-match-link{font-size:22px}
      .it-match-details{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:8px}.it-match-detail{background:#f6f8fa;border-radius:12px;padding:10px}.it-match-detail span{display:block;color:#6B7280;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.03em}.it-match-detail b{display:block;color:#0D1B2A;margin-top:3px;font-size:13px}.it-match-job{margin-top:12px;padding:11px 12px;border-radius:13px;background:#fff;border:1px solid #e4ebf1}.it-match-job b{display:block}.it-match-actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:12px}
      .it-match-modal .it-match-people{margin-top:12px}.it-match-modal h2{margin-bottom:5px}
      @media(max-width:620px){.it-match-details{grid-template-columns:1fr 1fr}.it-match-people{grid-template-columns:1fr}.it-match-link{display:none}.it-match-person{padding:8px;background:rgba(255,255,255,.72);border-radius:14px}.it-match-actions .btn{flex:1}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){
    for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);
    sb=window.IntegraTrampoSupabase||null;
    return sb;
  }

  async function fetchMatches(){
    if(!sb)await waitForSupabase();
    if(!sb)return [];
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user){matches=[];return matches}
      const {data,error}=await sb.rpc('it_my_matches_v1');
      if(error)throw error;
      matches=Array.isArray(data)?data:[];
      return matches;
    }catch(e){
      console.warn('[IntegraTrampo Match] não foi possível carregar',e);
      matches=[];return matches;
    }
  }

  function personHtml(m,type){
    const professional=type==='professional';
    const name=professional?(m.professional_name||'Profissional'):(m.company_name||'Contratante');
    const sub=professional?(m.professional_role||'Profissional'):(m.company_kind||'Contratante');
    const image=professional?m.professional_photo_url:m.company_logo_url;
    return `<div class="it-match-person">${image?`<img src="${esc(image)}" alt="${esc(name)}">`:`<div class="it-match-avatar">${professional?'👤':'🏢'}</div>`}<div><b>${esc(name)}</b><span>${esc(sub)}</span></div></div>`;
  }

  function detailHtml(m){
    return `<div class="it-match-details">
      <div class="it-match-detail"><span>Data</span><b>📅 ${esc(fmtDate(m.service_date))}</b></div>
      <div class="it-match-detail"><span>Horário</span><b>⏰ ${esc(fmtTime(m.start_time))}${m.end_time?' – '+esc(fmtTime(m.end_time)):''}</b></div>
      <div class="it-match-detail"><span>Diária</span><b>💰 ${esc(money(m.daily_rate))}</b></div>
      <div class="it-match-detail"><span>Local</span><b>📍 ${esc(m.city||'Teodoro Sampaio')}</b></div>
    </div>`;
  }

  function matchCard(m){
    return `<article class="it-match-card" data-match-service="${esc(m.service_id)}">
      <div class="it-match-top"><span class="it-match-badge">🤝 MATCH</span><span class="it-match-status">${esc(statusLabel(m.status))}</span></div>
      <div class="it-match-people">${personHtml(m,'professional')}<div class="it-match-link">↔</div>${personHtml(m,'company')}</div>
      <div class="it-match-job"><b>💼 ${esc(m.job_title||'Serviço')}</b><span class="small muted">${esc(m.category||'')} ${m.vacancies?`· ${Number(m.vacancies)} vaga(s)`:''}</span></div>
      ${detailHtml(m)}
      <div class="it-match-actions"><button class="btn btn--navy" type="button" onclick="userPanelTab('services')">Ver em Serviços</button></div>
    </article>`;
  }

  async function renderMatchSection(){
    injectStyles();
    const flow=$id('serviceFlow');if(!flow)return;
    flow.querySelector('#itMatchStage1')?.remove();
    const list=await fetchMatches();if(!list.length)return;
    const section=document.createElement('section');section.id='itMatchStage1';section.className='it-match-stage';
    section.innerHTML=`<div class="it-match-stage__head"><div><h3>🤝 ${list.length===1?'Seu match':'Seus matches'}</h3><p class="small muted">A mesma contratação aparece para profissional e contratante.</p></div><span class="status status--ok">${list.length} ${list.length===1?'match':'matches'}</span></div>${list.map(matchCard).join('')}`;
    flow.prepend(section);
  }

  function openMatchModal(m){
    if(!m||typeof window.modal!=='function')return;
    window.modal(`<div class="it-match-modal"><div class="notice">🎉 <b>Match realizado!</b> A seleção virou uma contratação registrada na IntegraTrampo.</div><h2>${esc(m.job_title||'Serviço')}</h2><p class="muted">Profissional e contratante já enxergam este mesmo match no painel.</p><div class="it-match-people">${personHtml(m,'professional')}<div class="it-match-link">↔</div>${personHtml(m,'company')}</div>${detailHtml(m)}<div class="it-match-job"><b>Status</b><span class="small muted">${esc(statusLabel(m.status))}</span></div><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();go('painel');setTimeout(()=>userPanelTab('services'),100)">Abrir no painel</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div></div>`);
  }

  function patchRenderPanel(){
    const prev=window.renderPanel;
    if(typeof prev!=='function'||prev.__itMatchV9)return;
    const wrapped=async function(...args){
      const out=await prev.apply(this,args);
      await renderMatchSection();
      return out;
    };
    wrapped.__itMatchV9=true;window.renderPanel=wrapped;
  }

  function patchSelection(){
    const prev=window.setApplicationStatus;
    if(typeof prev!=='function'||prev.__itMatchV9)return;
    const wrapped=async function(id,status){
      const out=await prev.apply(this,arguments);
      if(status==='selected'){
        const list=await fetchMatches();
        const found=list.find(m=>String(m.application_id)===String(id));
        if(found){await renderMatchSection();openMatchModal(found)}
      }
      return out;
    };
    wrapped.__itMatchV9=true;window.setApplicationStatus=wrapped;
  }

  async function init(){
    injectStyles();await waitForSupabase();
    patchRenderPanel();patchSelection();
    // Protege contra camadas tardias que substituam essas funções durante o carregamento.
    let tries=0;const timer=setInterval(()=>{patchRenderPanel();patchSelection();if(++tries>=24)clearInterval(timer)},250);
    if($id('screen-painel')?.classList.contains('is-active'))renderMatchSection();
  }

  window.IntegraTrampoMatchV9={version:9,fetchMatches,render:renderMatchSection,open:m=>openMatchModal(m),get matches(){return [...matches]}};
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
