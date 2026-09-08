// IntegraTrampo · rodada extra de experiência do usuário
// Onboarding, favoritos persistentes, perfil do contratante e compartilhamento.
(function(){
  const COMPANY_BUCKET='integratrampo-company-logos';
  let sb=null,currentUser=null,preferences=null,initialized=false;
  let favoriteKeys=new Set();
  const oldToggleFav=window.toggleFav;
  const oldProCard=window.proCard;
  const oldOpenPro=window.openPro;
  const oldOpenJob=window.openJob;
  const oldRenderPanel=window.renderPanel;

  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const key=(type,id)=>`${type}:${id}`;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const isRealId=id=>!/^(sample-|demo-)/.test(String(id||''));

  function injectStyles(){
    if($id('integratrampoUserPlusStyles'))return;
    const s=document.createElement('style');s.id='integratrampoUserPlusStyles';s.textContent=`
      .user-plus-tools{display:flex;gap:8px;flex-wrap:wrap;margin:0 0 14px}.user-plus-tools .btn{padding:9px 12px}
      .user-fav-btn{min-width:42px}.user-fav-btn.is-saved{background:#fff1ec;border-color:#ffb49a;color:#c2410c}
      .user-onboard-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px;margin:14px 0}.user-onboard-card{border:1px solid #dfe6ee;background:#fff;border-radius:16px;padding:16px;text-align:left;cursor:pointer}.user-onboard-card:hover{border-color:#0D1B2A;box-shadow:0 8px 22px rgba(13,27,42,.08)}.user-onboard-card strong{display:block;font-size:16px;margin:7px 0 4px}.user-onboard-card span{font-size:13px;color:#66717d}
      .user-fav-list{display:grid;gap:10px}.user-fav-item{display:flex;gap:12px;align-items:center;border:1px solid #e1e8ef;border-radius:14px;padding:11px}.user-fav-item img{width:56px;height:56px;border-radius:12px;object-fit:cover;background:#eef2f6}.user-fav-item__body{flex:1;min-width:0}.user-fav-item__body b{display:block}.user-fav-item__body span{font-size:12px;color:#687481}.user-share-note{font-size:12px;color:#687481;margin-top:7px}
      @media(max-width:680px){.user-onboard-grid{grid-template-columns:1fr}.user-plus-tools .btn{flex:1}.user-fav-item{align-items:flex-start}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);return window.IntegraTrampoSupabase||null}
  async function refreshUser(){if(!sb)return null;try{const {data}=await sb.auth.getUser();currentUser=data?.user||null}catch{currentUser=null}return currentUser}

  async function loadPreferences(){
    if(!currentUser){preferences=null;return null}
    const {data,error}=await sb.from('it_user_preferences').select('mode,onboarding_completed').eq('user_id',currentUser.id).maybeSingle();
    if(error){console.warn('preferences',error);return null}
    preferences=data||{mode:'both',onboarding_completed:false};return preferences;
  }

  async function savePreferences(mode,completed=true){
    if(!currentUser)return;
    const payload={user_id:currentUser.id,mode,onboarding_completed:!!completed,updated_at:new Date().toISOString()};
    const {error}=await sb.from('it_user_preferences').upsert(payload,{onConflict:'user_id'});if(error)throw error;
    preferences=payload;
  }

  async function loadFavorites(){
    favoriteKeys=new Set();
    if(!currentUser){syncLocalFavorites();return}
    const {data,error}=await sb.from('it_favorites').select('entity_type,entity_id').eq('user_id',currentUser.id);if(error){console.warn('favorites',error);return}
    (data||[]).forEach(x=>favoriteKeys.add(key(x.entity_type,x.entity_id)));syncLocalFavorites();
  }

  function syncLocalFavorites(){
    try{
      if(typeof state==='undefined'||!Array.isArray(state.fav))return;
      const samples=state.fav.filter(x=>!isRealId(x));
      const realJobs=[...favoriteKeys].filter(x=>x.startsWith('opportunity:')).map(x=>x.split(':')[1]);
      state.fav=[...new Set([...samples,...realJobs])];
      if(typeof save==='function')save();
    }catch(e){console.warn('favorite sync',e)}
  }

  async function toggleFavorite(type,id){
    if(!currentUser){if(type==='opportunity'&&typeof oldToggleFav==='function'){oldToggleFav(id);return}if(typeof loginModal==='function')loginModal();return}
    const k=key(type,id),saved=favoriteKeys.has(k);
    try{
      if(saved){const {error}=await sb.from('it_favorites').delete().eq('user_id',currentUser.id).eq('entity_type',type).eq('entity_id',id);if(error)throw error;favoriteKeys.delete(k)}
      else{const {error}=await sb.from('it_favorites').insert({user_id:currentUser.id,entity_type:type,entity_id:id});if(error)throw error;favoriteKeys.add(k)}
      syncLocalFavorites();
      if(typeof renderHome==='function')renderHome();if(typeof renderJobs==='function')renderJobs();if(typeof renderPros==='function')renderPros();
      if(typeof toast==='function')toast(saved?'Removido dos favoritos':'Salvo nos favoritos');
    }catch(e){console.error(e);if(typeof toast==='function')toast('Não foi possível atualizar os favoritos')}
  }

  window.toggleFav=function(id){if(!isRealId(id)||!currentUser){return typeof oldToggleFav==='function'?oldToggleFav(id):undefined}return toggleFavorite('opportunity',id)};
  window.toggleProfessionalFavorite=id=>toggleFavorite('professional',id);

  function patchProfessionalCards(){
    if(typeof oldProCard!=='function')return;
    window.proCard=function(p){
      const html=oldProCard(p);if(!p||!isRealId(p.id))return html;
      const saved=favoriteKeys.has(key('professional',p.id));
      const btn=`<button class="btn btn--outline user-fav-btn ${saved?'is-saved':''}" title="${saved?'Remover dos favoritos':'Salvar profissional'}" onclick="event.stopPropagation();toggleProfessionalFavorite('${esc(p.id)}')">${saved?'♥':'♡'}</button>`;
      return html.replace('<div class="card-actions">',`<div class="card-actions">${btn}`);
    };
  }

  function addModalAction(html){const actions=document.querySelector('#modalRoot .modal-actions');if(actions)actions.insertAdjacentHTML('beforeend',html)}
  window.openPro=function(id){if(typeof oldOpenPro==='function')oldOpenPro(id);if(!isRealId(id))return;setTimeout(()=>{const saved=favoriteKeys.has(key('professional',id));addModalAction(`<button class="btn btn--outline" onclick="toggleProfessionalFavorite('${esc(id)}')">${saved?'♥ Salvo':'♡ Favoritar'}</button><button class="btn btn--outline" onclick="shareIntegraTrampo('pro','${esc(id)}')">Compartilhar</button>`)},0)};
  window.openJob=function(id){if(typeof oldOpenJob==='function')oldOpenJob(id);if(!isRealId(id))return;setTimeout(()=>addModalAction(`<button class="btn btn--outline" onclick="shareIntegraTrampo('job','${esc(id)}')">Compartilhar vaga</button>`),0)};

  window.shareIntegraTrampo=async function(type,id){
    const u=new URL(window.location.origin+window.location.pathname);u.searchParams.set(type,id);u.searchParams.set('utm_source','share');u.searchParams.set('utm_medium','user_share');
    const title=type==='job'?'Vaga na IntegraTrampo':'Profissional na IntegraTrampo';
    try{if(navigator.share){await navigator.share({title,text:'Veja na IntegraTrampo',url:u.toString()})}else{await navigator.clipboard.writeText(u.toString());if(typeof toast==='function')toast('Link copiado')}}catch(e){if(e?.name!=='AbortError')console.warn(e)}
  };

  window.chooseIntegraTrampoMode=async function(mode,launch=true){
    try{await savePreferences(mode,true);if(typeof closeModal==='function')closeModal();if(typeof toast==='function')toast('Preferência salva');
      if(!launch)return;
      if(mode==='worker'&&typeof workerModal==='function')workerModal();else if(mode==='hirer'&&typeof hiringModal==='function')hiringModal();else if(typeof go==='function')go('painel');
    }catch(e){console.error(e);if(typeof toast==='function')toast('Não foi possível salvar sua preferência')}
  };

  window.openUserPreferences=function(){
    if(!currentUser){if(typeof loginModal==='function')loginModal();return}
    const mode=preferences?.mode||'both';
    modal(`<div class="notice">⚙️ Você pode mudar isso quando quiser.</div><h2>Como você usa a IntegraTrampo?</h2><div class="user-onboard-grid">
      <button class="user-onboard-card" onclick="chooseIntegraTrampoMode('worker',false)">👤<strong>Quero trabalhar</strong><span>Buscar oportunidades e receber propostas.</span>${mode==='worker'?'<div class="small" style="margin-top:8px">✅ Atual</div>':''}</button>
      <button class="user-onboard-card" onclick="chooseIntegraTrampoMode('hirer',false)">🏢<strong>Quero contratar</strong><span>Criar necessidades, vagas e selecionar profissionais.</span>${mode==='hirer'?'<div class="small" style="margin-top:8px">✅ Atual</div>':''}</button>
      <button class="user-onboard-card" onclick="chooseIntegraTrampoMode('both',false)">🤝<strong>Quero os dois</strong><span>Usar os dois lados da plataforma.</span>${mode==='both'?'<div class="small" style="margin-top:8px">✅ Atual</div>':''}</button>
    </div><div class="modal-actions"><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
  };

  function onboardingModal(){
    if(!currentUser||preferences?.onboarding_completed)return;
    modal(`<div class="notice">👋 Bem-vindo à IntegraTrampo. Vamos personalizar sua primeira tela.</div><h2>O que você quer fazer?</h2><p class="muted">Escolha seu objetivo principal. Você pode alterar depois.</p><div class="user-onboard-grid">
      <button class="user-onboard-card" onclick="chooseIntegraTrampoMode('worker')">👤<strong>Quero trabalhar</strong><span>Criar meu perfil e encontrar oportunidades.</span></button>
      <button class="user-onboard-card" onclick="chooseIntegraTrampoMode('hirer')">🏢<strong>Quero contratar</strong><span>Encontrar profissionais e criar necessidades.</span></button>
      <button class="user-onboard-card" onclick="chooseIntegraTrampoMode('both')">🤝<strong>Quero os dois</strong><span>Trabalhar e também contratar quando precisar.</span></button>
    </div>`);
  }

  async function getMyCompany(){
    if(!currentUser)return null;const {data,error}=await sb.from('it_companies').select('id,display_name,kind,city,description,logo_url,is_published,created_at').eq('user_id',currentUser.id).order('created_at',{ascending:true}).limit(1);if(error)throw error;return data?.[0]||null;
  }

  window.openMyCompanyProfile=async function(){
    if(!currentUser){if(typeof loginModal==='function')loginModal();return}
    try{
      const c=await getMyCompany();
      modal(`<div class="notice">🏢 Alterações no perfil do contratante voltam para revisão antes de aparecer publicamente.</div><h2>${c?'Meu perfil de contratante':'Criar perfil de contratante'}</h2><div class="form-grid">
        <div class="field"><label>Nome / empresa</label><input id="myCompanyName" value="${esc(c?.display_name||'')}"></div>
        <div class="field"><label>Tipo</label><input id="myCompanyKind" value="${esc(c?.kind||'Empresa local')}" placeholder="Ex.: Restaurante, pessoa física"></div>
        <div class="field full"><label>Cidade</label><input id="myCompanyCity" value="${esc(c?.city||'Teodoro Sampaio')}"></div>
        <div class="field full"><label>Sobre</label><textarea id="myCompanyDescription" maxlength="1200" placeholder="Conte brevemente sobre você ou sua empresa">${esc(c?.description||'')}</textarea></div>
        <div class="field full"><label>Logo ou foto</label><input id="myCompanyLogo" type="file" accept="image/jpeg,image/png,image/webp">${c?.logo_url?`<div style="margin-top:8px"><img src="${esc(c.logo_url)}" alt="Identificação atual" style="width:72px;height:72px;object-fit:cover;border-radius:14px"></div>`:''}</div>
      </div><div class="user-inline-note">${c?.is_published?'✅ Perfil publicado atualmente. Ao salvar alterações, ele ficará em revisão novamente.':'⏳ Perfil ainda não publicado.'}</div>
      <div class="modal-actions"><button class="btn btn--orange" id="saveMyCompanyBtn" onclick="saveMyCompanyProfile()">Salvar e enviar para revisão</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
    }catch(e){console.error(e);if(typeof toast==='function')toast('Não foi possível carregar o perfil do contratante')}
  };

  window.saveMyCompanyProfile=async function(){
    const btn=$id('saveMyCompanyBtn'),name=$id('myCompanyName')?.value.trim()||'',kind=$id('myCompanyKind')?.value.trim()||'',city=$id('myCompanyCity')?.value.trim()||'',description=$id('myCompanyDescription')?.value.trim()||'';
    if(name.length<2||city.length<2){if(typeof toast==='function')toast('Preencha nome e cidade');return}
    if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{
      const existing=await getMyCompany();let logoUrl=existing?.logo_url||null,file=$id('myCompanyLogo')?.files?.[0];
      if(file){if(!['image/jpeg','image/png','image/webp'].includes(file.type))throw new Error('invalid_image');if(file.size>5*1024*1024)throw new Error('image_too_large');const ext=file.type==='image/png'?'png':file.type==='image/webp'?'webp':'jpg';const path=`${currentUser.id}/logo-${Date.now()}.${ext}`;const {error}=await sb.storage.from(COMPANY_BUCKET).upload(path,file,{contentType:file.type,cacheControl:'3600',upsert:false});if(error)throw error;logoUrl=sb.storage.from(COMPANY_BUCKET).getPublicUrl(path).data.publicUrl}
      const {error}=await sb.rpc('it_save_my_company',{p_display_name:name,p_kind:kind||null,p_city:city,p_description:description||null,p_logo_url:logoUrl});if(error)throw error;
      if(typeof closeModal==='function')closeModal();if(typeof toast==='function')toast('Perfil enviado para revisão');if(typeof renderPanel==='function')renderPanel();
    }catch(e){console.error(e);if(typeof toast==='function')toast(e.message==='image_too_large'?'A imagem deve ter no máximo 5 MB':'Não foi possível salvar o perfil');if(btn){btn.disabled=false;btn.textContent='Salvar e enviar para revisão'}}
  };

  window.openFavoritesModal=function(){
    if(!currentUser){if(typeof loginModal==='function')loginModal();return}
    let items=[];
    try{
      const jobs=typeof publicJobs!=='undefined'?publicJobs:[],pros=typeof publicPros!=='undefined'?publicPros:[];
      favoriteKeys.forEach(k=>{const [type,id]=k.split(':');if(type==='opportunity'){const j=jobs.find(x=>String(x.id)===id);items.push({type,id,title:j?.title||'Vaga indisponível',subtitle:j?`${j.company} · ${j.cat}`:'Essa vaga pode ter sido encerrada.',img:j?.img,open:j?`openJob('${esc(id)}')`:''})}else{const p=pros.find(x=>String(x.id)===id);items.push({type,id,title:p?.name||'Profissional indisponível',subtitle:p?`${p.role} · ${p.city||''}`:'O perfil pode estar temporariamente fora do ar.',img:p?.img,open:p?`openPro('${esc(id)}')`:''})}});
    }catch(e){console.warn(e)}
    modal(`<div class="notice">❤️ Seus favoritos ficam salvos na sua conta e aparecem em qualquer aparelho.</div><h2>Favoritos</h2><div class="user-fav-list">${items.length?items.map(x=>`<div class="user-fav-item">${x.img?`<img src="${esc(x.img)}" alt="">`:'<div style="width:56px;height:56px;border-radius:12px;background:#eef2f6;display:grid;place-items:center">❤️</div>'}<div class="user-fav-item__body"><b>${esc(x.title)}</b><span>${esc(x.subtitle)}</span></div>${x.open?`<button class="btn btn--outline" onclick="closeModal();${x.open}">Abrir</button>`:''}<button class="btn btn--outline" onclick="toggleFavoriteFromModal('${x.type}','${esc(x.id)}')">Remover</button></div>`).join(''):'<div class="user-empty">Você ainda não salvou nenhuma vaga ou profissional.</div>'}</div><div class="modal-actions"><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`);
  };
  window.toggleFavoriteFromModal=async(type,id)=>{await toggleFavorite(type,id);openFavoritesModal()};

  function decoratePanel(){
    const screen=$id('screen-painel');if(!screen||!currentUser)return;
    let tools=$id('userPlusTools');if(!tools){tools=document.createElement('div');tools.id='userPlusTools';tools.className='user-plus-tools';tools.innerHTML='<button class="btn btn--outline" onclick="openFavoritesModal()">❤️ Favoritos</button><button class="btn btn--outline" onclick="openMyCompanyProfile()">🏢 Perfil contratante</button><button class="btn btn--outline" onclick="openUserPreferences()">⚙️ Preferências</button>';const title=screen.querySelector('.section-title');if(title)title.insertAdjacentElement('afterend',tools);else screen.insertBefore(tools,screen.firstChild)}
  }

  window.renderPanel=async function(){const r=typeof oldRenderPanel==='function'?await oldRenderPanel():undefined;setTimeout(decoratePanel,30);return r};

  async function openDeepLink(){
    const params=new URLSearchParams(location.search),job=params.get('job'),pro=params.get('pro');if(!job&&!pro)return;
    for(let i=0;i<30;i++){if(job&&typeof publicJobs!=='undefined'&&publicJobs.some(x=>String(x.id)===job)){openJob(job);return}if(pro&&typeof publicPros!=='undefined'&&publicPros.some(x=>String(x.id)===pro)){openPro(pro);return}await wait(150)}
  }

  async function onSessionChange(user,showOnboarding=true){
    currentUser=user||null;await loadPreferences();await loadFavorites();patchProfessionalCards();
    if(typeof renderHome==='function')renderHome();if(typeof renderJobs==='function')renderJobs();if(typeof renderPros==='function')renderPros();
    if(currentUser&&$id('screen-painel')?.classList.contains('is-active'))decoratePanel();
    if(currentUser&&showOnboarding&&!preferences?.onboarding_completed)setTimeout(onboardingModal,450);
  }

  async function init(){
    if(initialized)return;initialized=true;injectStyles();sb=await waitForSupabase();if(!sb)return;const {data}=await sb.auth.getUser();await onSessionChange(data?.user||null,true);await openDeepLink();
    sb.auth.onAuthStateChange((event,session)=>setTimeout(()=>onSessionChange(session?.user||null,event==='SIGNED_IN'),0));
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
