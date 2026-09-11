// IntegraTrampo · Etapa 12 · recomendações por afinidade
// Ranking explicável: usa categoria, cidade, disponibilidade, valor, reputação, favoritos e agenda.
(function(){
  if(window.IntegraTrampoStage12Recommendations)return;

  let sb=null;
  let currentUser=null;
  let data={algorithm_version:'rules_v1',viewer:{has_professional_profile:false,has_company_profile:false},opportunities:[],professionals:[]};
  let renderTimer=null;
  let renderBusy=false;
  let modalOpen=false;

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const money=v=>v===null||v===undefined||v===''?'A combinar':`R$ ${Number(v).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2})}`;
  const fmtDate=v=>{if(!v)return 'A combinar';try{return new Intl.DateTimeFormat('pt-BR').format(new Date(String(v).length===10?v+'T12:00:00':v))}catch{return String(v)}};
  const fmtTime=v=>v?String(v).slice(0,5):'';
  const fmtRange=(a,b)=>a&&b?`${fmtTime(a)}–${fmtTime(b)}${String(b)<String(a)?' (+1 dia)':''}`:'A combinar';
  const scoreClass=s=>Number(s)>=75?'is-high':Number(s)>=45?'is-mid':'is-low';

  function injectStyles(){
    if(document.getElementById('integratrampoStage12Styles'))return;
    const s=document.createElement('style');
    s.id='integratrampoStage12Styles';
    s.textContent=`
      .it-stage12{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#f6fffc,#fff);padding:14px}.it-stage12__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage12__head h4{margin:0}.it-stage12__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#0D1B2A;color:#fff}.it-stage12__explain{margin-top:8px;border-radius:12px;background:#eef9f6;color:#38635a;padding:9px 10px;font-size:11px;line-height:1.45}.it-stage12__group{margin-top:14px}.it-stage12__group-head{display:flex;justify-content:space-between;gap:8px;align-items:end;flex-wrap:wrap}.it-stage12__group-head h5{margin:0;font-size:14px}.it-stage12__grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:9px;margin-top:9px}.it-stage12__card{border:1px solid #e2e8ee;border-radius:15px;background:#fff;padding:11px;display:grid;gap:8px}.it-stage12__top{display:flex;justify-content:space-between;gap:10px;align-items:flex-start}.it-stage12__identity{display:flex;gap:9px;min-width:0}.it-stage12__thumb{width:48px;height:48px;border-radius:13px;object-fit:cover;background:#eef3f5;display:grid;place-items:center;font-size:22px;flex:0 0 auto}.it-stage12__card h6{margin:0 0 3px;font-size:13px;color:#0D1B2A}.it-stage12__meta{font-size:11px;color:#687481;line-height:1.45}.it-stage12__score{min-width:64px;text-align:center;border-radius:12px;padding:7px 6px;font-weight:900;font-size:15px}.it-stage12__score small{display:block;font-size:8px;letter-spacing:.04em;margin-top:1px}.it-stage12__score.is-high{background:#e8faf4;color:#087858}.it-stage12__score.is-mid{background:#fff6dd;color:#855d00}.it-stage12__score.is-low{background:#f2f4f7;color:#59636e}.it-stage12__reasons{display:flex;gap:5px;flex-wrap:wrap}.it-stage12__reason{font-size:9px;font-weight:800;background:#f3f7fa;color:#53606d;border-radius:999px;padding:4px 6px}.it-stage12__actions{display:flex;gap:6px;flex-wrap:wrap}.it-stage12__actions .btn{font-size:11px;padding:6px 8px;flex:1}.it-stage12__empty{margin-top:9px;border-radius:13px;background:#f7f9fb;color:#65717d;padding:12px;font-size:12px}.it-stage12__foot{display:flex;justify-content:flex-end;margin-top:11px}.it-stage12-modal{max-width:820px}.it-stage12-modal__scroll{max-height:60vh;overflow:auto;padding-right:2px}.it-stage12-modal .it-stage12__grid{grid-template-columns:1fr 1fr}
      @media(max-width:680px){.it-stage12__grid,.it-stage12-modal .it-stage12__grid{grid-template-columns:1fr}.it-stage12__top{align-items:flex-start}.it-stage12__actions .btn{min-width:0}}
    `;
    document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function getUser(){if(!sb)await waitForSupabase();if(!sb)return null;try{const {data:{user}}=await sb.auth.getUser();currentUser=user||null;return currentUser}catch{currentUser=null;return null}}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}
  function normalize(raw){const r=raw&&typeof raw==='object'?raw:{};data={algorithm_version:r.algorithm_version||'rules_v1',generated_at:r.generated_at||null,viewer:{has_professional_profile:!!r.viewer?.has_professional_profile,has_company_profile:!!r.viewer?.has_company_profile},opportunities:Array.isArray(r.opportunities)?r.opportunities:[],professionals:Array.isArray(r.professionals)?r.professionals:[]};return data}

  async function refresh(){
    const user=await getUser();
    if(!user){normalize(null);return data}
    try{return normalize(await rpc('it_my_recommendations_v1',{p_limit:12}))}catch(e){console.warn('[Stage12 recommendations]',e);return data}
  }

  function reasonsHtml(reasons){const arr=Array.isArray(reasons)?reasons:[];return arr.length?`<div class="it-stage12__reasons">${arr.slice(0,6).map(r=>`<span class="it-stage12__reason">${esc(r)}</span>`).join('')}</div>`:''}
  function favLabel(v){return v?'★ Salvo':'☆ Salvar'}

  function opportunityCard(o,compact=false){
    const img=o.image_url?`<img class="it-stage12__thumb" src="${esc(o.image_url)}" alt="Imagem de ${esc(o.title||'vaga')}">`:`<div class="it-stage12__thumb">💼</div>`;
    return `<article class="it-stage12__card"><div class="it-stage12__top"><div class="it-stage12__identity">${img}<div><h6>${esc(o.title||'Oportunidade')}</h6><div class="it-stage12__meta">${esc(o.company_name||'Contratante')} · ${esc(o.category||'')}</div><div class="it-stage12__meta">📍 ${esc(o.city||'')} · 📅 ${esc(fmtDate(o.service_date))}</div><div class="it-stage12__meta">⏰ ${esc(fmtRange(o.start_time,o.end_time))} · <b>${esc(money(o.daily_rate))}</b></div></div></div><div class="it-stage12__score ${scoreClass(o.affinity_score)}">${Number(o.affinity_score||0)}<small>AFINIDADE / 100</small></div></div>${reasonsHtml(o.reasons)}${compact?'':`<div class="it-stage12__actions"><button class="btn btn--green" type="button" onclick="stage12OpenOpportunity('${esc(o.id)}')">Ver vaga</button><button class="btn btn--outline" type="button" onclick="stage12ToggleFavorite('opportunity','${esc(o.id)}')">${favLabel(o.is_favorite)}</button></div>`}</article>`;
  }

  function professionalCard(p,compact=false){
    const img=p.photo_url?`<img class="it-stage12__thumb" src="${esc(p.photo_url)}" alt="Foto de ${esc(p.display_name||'profissional')}">`:`<div class="it-stage12__thumb">👤</div>`;
    const rating=Number(p.review_count||0)>0?`⭐ ${Number(p.rating||0).toFixed(1)} · ${Number(p.review_count)} avaliação(ões)`:'Ainda sem avaliações';
    return `<article class="it-stage12__card"><div class="it-stage12__top"><div class="it-stage12__identity">${img}<div><h6>${esc(p.display_name||'Profissional')}</h6><div class="it-stage12__meta">${esc(p.role_title||'Profissional')} · ${esc(p.city||'')}</div><div class="it-stage12__meta">${esc(rating)} · <b>${esc(money(p.reference_daily))}</b></div></div></div><div class="it-stage12__score ${scoreClass(p.affinity_score)}">${Number(p.affinity_score||0)}<small>AFINIDADE / 100</small></div></div>${reasonsHtml(p.reasons)}${compact?'':`<div class="it-stage12__actions"><button class="btn btn--outline" type="button" onclick="stage12OpenProfessional('${esc(p.id)}')">Ver perfil</button>${typeof window.openStage7DirectOffer==='function'?`<button class="btn btn--green" type="button" onclick="openStage7DirectOffer('${esc(p.id)}')">Contratar</button>`:''}<button class="btn btn--outline" type="button" onclick="stage12ToggleFavorite('professional','${esc(p.id)}')">${favLabel(p.is_favorite)}</button></div>`}</article>`;
  }

  function sectionHtml(){
    const v=data.viewer||{},jobs=data.opportunities||[],pros=data.professionals||[];
    const hasRole=v.has_professional_profile||v.has_company_profile;
    let body='';
    if(v.has_professional_profile)body+=`<section class="it-stage12__group"><div class="it-stage12__group-head"><h5>💼 Vagas com maior afinidade</h5><span class="small muted">${jobs.length} sugestão(ões)</span></div>${jobs.length?`<div class="it-stage12__grid">${jobs.slice(0,4).map(x=>opportunityCard(x,true)).join('')}</div>`:`<div class="it-stage12__empty">Nenhuma vaga válida para recomendar agora. Conflitos de agenda e candidaturas já feitas ficam de fora.</div>`}</section>`;
    if(v.has_company_profile)body+=`<section class="it-stage12__group"><div class="it-stage12__group-head"><h5>👤 Profissionais com maior afinidade</h5><span class="small muted">${pros.length} sugestão(ões)</span></div>${pros.length?`<div class="it-stage12__grid">${pros.slice(0,4).map(x=>professionalCard(x,true)).join('')}</div>`:`<div class="it-stage12__empty">Ainda não há profissionais vinculados a contas e disponíveis que combinem com seu histórico de contratação.</div>`}</section>`;
    if(!hasRole)body=`<div class="it-stage12__empty">Ative um perfil profissional ou de contratante para receber recomendações personalizadas.</div>`;
    return `<section class="it-stage12" id="itStage12Recommendations"><div class="it-stage12__head"><div><h4>✨ Recomendações para você</h4><div class="small muted">Descoberta ordenada por afinidade com seu perfil e atividade recente.</div></div><span class="it-stage12__badge">ETAPA 12</span></div><div class="it-stage12__explain">A nota não é promessa de contratação nem decisão automática. Ela só organiza opções usando sinais objetivos: área, cidade, disponibilidade, valores, reputação, favoritos e agenda.</div>${body}<div class="it-stage12__foot"><button class="btn btn--navy" type="button" onclick="openStage12Recommendations()">Ver todas as recomendações</button></div></section>`;
  }

  async function renderSection(){
    if(renderBusy)return;renderBusy=true;
    try{
      injectStyles();await refresh();document.getElementById('itStage12Recommendations')?.remove();
      if(!currentUser)return;
      const flow=document.getElementById('serviceFlow');if(!flow)return;
      const holder=document.createElement('div');holder.innerHTML=sectionHtml();const section=holder.firstElementChild;if(!section)return;
      const s11=document.getElementById('itStage11Favorites'),s10=document.getElementById('itStage10Activity');
      if(s11)s11.insertAdjacentElement('afterend',section);else if(s10)s10.insertAdjacentElement('afterend',section);else flow.appendChild(section);
    }finally{renderBusy=false}
  }
  function scheduleRender(delay=140){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderSection().catch(e=>console.warn('[Stage12 render]',e)),delay)}

  function renderModal(){
    if(typeof window.modal!=='function')return;
    modalOpen=true;
    const v=data.viewer||{},jobs=data.opportunities||[],pros=data.professionals||[];
    let body='';
    if(v.has_professional_profile)body+=`<section class="it-stage12__group"><div class="it-stage12__group-head"><h3>💼 Vagas recomendadas</h3><span class="small muted">Maior afinidade primeiro</span></div>${jobs.length?`<div class="it-stage12__grid">${jobs.map(x=>opportunityCard(x,false)).join('')}</div>`:`<div class="it-stage12__empty">Nenhuma vaga válida para recomendar neste momento.</div>`}</section>`;
    if(v.has_company_profile)body+=`<section class="it-stage12__group"><div class="it-stage12__group-head"><h3>👤 Profissionais recomendados</h3><span class="small muted">Maior afinidade primeiro</span></div>${pros.length?`<div class="it-stage12__grid">${pros.map(x=>professionalCard(x,false)).join('')}</div>`:`<div class="it-stage12__empty">Nenhum profissional disponível e vinculado a conta para recomendar agora.</div>`}</section>`;
    if(!v.has_professional_profile&&!v.has_company_profile)body=`<div class="it-stage12__empty">Complete e ative um perfil profissional ou de contratante para liberar recomendações.</div>`;
    window.modal(`<div class="it-stage12-modal"><div class="notice">✨ <b>Recomendações por afinidade.</b> A pontuação é explicável e não substitui sua decisão. Favoritar, mudar disponibilidade, publicar vagas ou atualizar seu perfil pode alterar a ordem.</div><h2>Recomendações para você</h2><div class="it-stage12-modal__scroll">${body}</div><div class="modal-actions"><button class="btn btn--outline" type="button" onclick="closeModal();window.IntegraTrampoStage12Recommendations?.closed()">Fechar</button></div></div>`);
  }

  window.openStage12Recommendations=async function(){
    const user=await getUser();
    if(!user){if(typeof window.modal==='function')window.modal(`<div class="notice">✨ As recomendações são personalizadas para a sua conta.</div><h2>Recomendações</h2><p class="muted">Entre para receber vagas e profissionais ordenados por afinidade.</p><div class="modal-actions"><button class="btn btn--navy" onclick="closeModal();loginModal()">Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);return}
    await refresh();renderModal();
  };

  window.stage12ToggleFavorite=async function(type,id){
    if(typeof window.stage11SetFavorite!=='function'){tell('Favoritos ainda não estão disponíveis.');return}
    const item=(type==='professional'?data.professionals:data.opportunities).find(x=>String(x.id)===String(id));
    const value=!(item?.is_favorite);
    const ok=await window.stage11SetFavorite(type,id,value);
    if(ok){await refresh();scheduleRender(10);if(modalOpen)setTimeout(renderModal,40)}
  };

  window.stage12OpenProfessional=function(id){
    const list=typeof window.publicPros!=='undefined'?window.publicPros:(typeof publicPros!=='undefined'?publicPros:[]);
    if(Array.isArray(list)&&list.some(x=>String(x.id)===String(id))&&typeof window.openPro==='function')return window.openPro(id);
    const p=(data.professionals||[]).find(x=>String(x.id)===String(id));if(!p||typeof window.modal!=='function')return;
    window.modal(`<div class="notice">✨ Recomendado com ${Number(p.affinity_score||0)}/100 de afinidade.</div><h2>${esc(p.display_name||'Profissional')}</h2><p class="muted">${esc(p.role_title||'')} · ${esc(p.city||'')}</p>${reasonsHtml(p.reasons)}<div class="modal-actions">${typeof window.openStage7DirectOffer==='function'?`<button class="btn btn--green" onclick="closeModal();openStage7DirectOffer('${esc(p.id)}')">Contratar</button>`:''}<button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
  };

  window.stage12OpenOpportunity=function(id){
    const list=typeof window.publicJobs!=='undefined'?window.publicJobs:(typeof publicJobs!=='undefined'?publicJobs:[]);
    if(Array.isArray(list)&&list.some(x=>String(x.id)===String(id))&&typeof window.openJob==='function')return window.openJob(id);
    const o=(data.opportunities||[]).find(x=>String(x.id)===String(id));if(!o||typeof window.modal!=='function')return;
    window.modal(`<div class="notice">✨ Recomendado com ${Number(o.affinity_score||0)}/100 de afinidade.</div><h2>${esc(o.title||'Vaga')}</h2><p class="muted">${esc(o.company_name||'')} · ${esc(o.category||'')} · ${esc(o.city||'')}</p><div class="meta"><span>📅 ${esc(fmtDate(o.service_date))}</span><span>⏰ ${esc(fmtRange(o.start_time,o.end_time))}</span></div><div class="money">${esc(money(o.daily_rate))}</div>${reasonsHtml(o.reasons)}<div class="modal-actions"><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
  };

  function installHooks(){
    const prev=window.renderPanel;if(typeof prev==='function'&&!prev.__stage12Wrapped){const wrapped=function(){const r=prev.apply(this,arguments);scheduleRender(100);return r};wrapped.__stage12Wrapped=true;window.renderPanel=wrapped}
  }

  async function init(){
    injectStyles();await waitForSupabase();installHooks();
    if(sb){try{sb.auth.onAuthStateChange(()=>{modalOpen=false;scheduleRender(180)})}catch{}}
    await refresh();
    if(document.getElementById('screen-painel')?.classList.contains('is-active'))scheduleRender(20);
  }

  window.IntegraTrampoStage12Recommendations={version:12,refresh:async()=>{await refresh();scheduleRender(0);return data},open:window.openStage12Recommendations,closed:()=>{modalOpen=false;scheduleRender(30)},getData:()=>data};
  init().catch(e=>console.warn('[Stage12 init]',e));
})();
