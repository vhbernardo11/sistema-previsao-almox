// IntegraTrampo · Etapa 16 · compartilhamento e deep links
// Gera links seguros para vagas/perfis publicados e abre o item certo ao chegar pelo link.
(function(){
  if(window.IntegraTrampoStage16Share)return;

  let pendingShare=null;
  let openingDeepLink=false;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const uuid=/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  function injectStyles(){
    if(document.getElementById('integratrampoStage16Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage16Styles';s.textContent=`
      .it-stage16-modal{max-width:620px}.it-stage16-head{display:flex;justify-content:space-between;gap:12px;align-items:flex-start}.it-stage16-badge{font-size:10px;font-weight:900;border-radius:999px;padding:5px 8px;background:#0D1B2A;color:#fff;white-space:nowrap}.it-stage16-preview{margin:12px 0;border:1px solid #dfe6ed;border-radius:16px;background:#f8fafc;padding:12px}.it-stage16-preview b{display:block;color:#0D1B2A;margin-bottom:4px}.it-stage16-preview span{font-size:12px;color:#687481;line-height:1.45}.it-stage16-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px;margin-top:12px}.it-stage16-share{min-height:46px;border:1px solid #d8e1e8;border-radius:13px;background:#fff;color:#0D1B2A;font:inherit;font-weight:850;cursor:pointer;padding:10px 12px}.it-stage16-share:hover{background:#f4f7fa}.it-stage16-share.is-wa{background:#eafaf1;border-color:#c7edd7;color:#087642}.it-stage16-share.is-copy{background:#eef4ff;border-color:#d4e2fb;color:#245c9c}.it-stage16-url{margin-top:10px;border-radius:11px;background:#f5f7fa;padding:9px 10px;font-size:10px;color:#697681;word-break:break-all}.it-stage16-note{margin-top:10px;font-size:11px;line-height:1.45;color:#6a7580}.it-stage16-unavailable{text-align:center;padding:8px 2px 2px}.it-stage16-unavailable .icon{font-size:34px;margin-bottom:6px}
      @media(max-width:520px){.it-stage16-grid{grid-template-columns:1fr}.it-stage16-share{width:100%}}
    `;document.head.appendChild(s);
  }

  function normalizeType(type){
    const v=String(type||'').toLowerCase();
    if(['job','vaga','opportunity'].includes(v))return 'opportunity';
    if(['pro','profissional','professional'].includes(v))return 'professional';
    return null;
  }

  function directUrl(type,id){
    const t=normalizeType(type);if(!t||!uuid.test(String(id||'')))return null;
    const u=new URL(window.location.origin+(window.location.pathname||'/'));
    u.search='';u.hash='';
    u.searchParams.set(t==='opportunity'?'vaga':'profissional',id);
    return u.toString();
  }

  function socialUrl(type,id,channel){
    const t=normalizeType(type);if(!t||!uuid.test(String(id||'')))return null;
    const u=new URL('/api/share',window.location.origin);
    u.searchParams.set('type',t==='opportunity'?'job':'pro');
    u.searchParams.set('id',id);
    if(channel)u.searchParams.set('channel',String(channel).slice(0,24));
    return u.toString();
  }

  function findEntity(type,id){
    const t=normalizeType(type);
    if(t==='opportunity')return (typeof publicJobs!=='undefined'?publicJobs:[]).find(x=>String(x.id)===String(id))||null;
    if(t==='professional')return (typeof publicPros!=='undefined'?publicPros:[]).find(x=>String(x.id)===String(id))||null;
    return null;
  }

  async function waitForEntity(type,id){
    for(let i=0;i<60;i++){
      const item=findEntity(type,id);if(item)return item;
      await wait(100);
    }
    return null;
  }

  function setMeta(attr,name,value){
    let el=document.querySelector(`meta[${attr}="${name}"]`);
    if(!el){el=document.createElement('meta');el.setAttribute(attr,name);document.head.appendChild(el)}
    el.setAttribute('content',value);
  }

  function setCanonical(type,id,item){
    const url=directUrl(type,id);if(!url)return;
    let canonical=document.querySelector('link[rel="canonical"]');
    if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical)}
    canonical.href=url;
    setMeta('property','og:url',url);
    setMeta('property','og:type','website');
    setMeta('name','twitter:card',item?.img?'summary_large_image':'summary');
    if(item?.img){setMeta('property','og:image',item.img);setMeta('name','twitter:image',item.img)}
  }

  function entityCopy(type,item){
    const t=normalizeType(type);
    if(t==='opportunity'){
      const price=item?.rate?`R$ ${Number(item.rate).toLocaleString('pt-BR',{maximumFractionDigits:2})}/dia`:'valor a combinar';
      return {title:`${item?.title||'Vaga'} | IntegraTrampo`,text:`💼 ${item?.title||'Vaga'} · ${item?.company||'Contratante aprovado'} · 📍 ${item?.city||'Teodoro Sampaio - SP'} · ${price}. Veja os detalhes na IntegraTrampo.`};
    }
    const price=item?.rate?`R$ ${Number(item.rate).toLocaleString('pt-BR',{maximumFractionDigits:2})}/dia`:'valor a combinar';
    return {title:`${item?.name||'Profissional'} | IntegraTrampo`,text:`👤 ${item?.name||'Profissional'} · ${item?.role||'Profissional'} · 📍 ${item?.city||'Teodoro Sampaio - SP'} · ${price}. Veja o perfil na IntegraTrampo.`};
  }

  async function copyText(value){
    try{if(navigator.clipboard?.writeText){await navigator.clipboard.writeText(value);return true}}catch{}
    try{const ta=document.createElement('textarea');ta.value=value;ta.setAttribute('readonly','');ta.style.position='fixed';ta.style.opacity='0';document.body.appendChild(ta);ta.select();const ok=document.execCommand('copy');ta.remove();return !!ok}catch{return false}
  }

  function popup(url){
    const w=window.open(url,'_blank','noopener,noreferrer,width=720,height=720');
    if(!w)tell('O navegador bloqueou a nova janela. Use “Copiar link”.');
  }

  function shareModal(type,id,item){
    injectStyles();
    const t=normalizeType(type),copy=entityCopy(t,item),url=directUrl(t,id);
    pendingShare={type:t,id,item,copy,url};
    if(typeof window.modal!=='function')return;
    window.modal(`<div class="it-stage16-modal"><div class="it-stage16-head"><div><h2 style="margin:0">🔗 Compartilhar</h2><div class="small muted">Envie esta ${t==='opportunity'?'vaga':'página profissional'} com um link que abre direto no conteúdo.</div></div><span class="it-stage16-badge">ETAPA 16</span></div><div class="it-stage16-preview"><b>${esc(copy.title)}</b><span>${esc(copy.text)}</span></div><div class="it-stage16-grid"><button class="it-stage16-share is-wa" type="button" onclick="stage16ShareChannel('whatsapp')">💬 WhatsApp</button><button class="it-stage16-share is-copy" type="button" onclick="stage16ShareChannel('copy')">🔗 Copiar link</button><button class="it-stage16-share" type="button" onclick="stage16ShareChannel('native')">📲 Compartilhar no celular</button><button class="it-stage16-share" type="button" onclick="stage16ShareChannel('facebook')">Facebook</button><button class="it-stage16-share" type="button" onclick="stage16ShareChannel('x')">X / Twitter</button><button class="it-stage16-share" type="button" onclick="stage16ShareChannel('linkedin')">LinkedIn</button></div><div class="it-stage16-url">${esc(url)}</div><div class="it-stage16-note">O link público mostra apenas dados que já estão publicados no marketplace. Dados privados de conta, telefone, candidaturas, conversas e pagamentos não entram no compartilhamento.</div><div class="modal-actions"><button class="btn btn--outline" type="button" onclick="stage16BackToEntity()">Voltar</button><button class="btn btn--outline" type="button" onclick="closeModal()">Fechar</button></div></div>`);
  }

  window.shareIntegraTrampo=async function(type,id){
    const t=normalizeType(type);if(!t||!uuid.test(String(id||''))){tell('Este item não pode ser compartilhado.');return false}
    const item=findEntity(t,id)||await waitForEntity(t,id);
    if(!item){tell('Este item não está mais publicado.');return false}
    shareModal(t,id,item);return true;
  };

  window.stage16ShareChannel=async function(channel){
    const p=pendingShare;if(!p)return;
    const ch=String(channel||'');
    if(ch==='copy'){
      const ok=await copyText(p.url);tell(ok?'Link copiado.':'Não consegui copiar automaticamente. Selecione o link exibido.');return;
    }
    const tracked=socialUrl(p.type,p.id,ch)||p.url;
    if(ch==='native'){
      if(navigator.share){try{await navigator.share({title:p.copy.title,text:p.copy.text,url:tracked});return}catch(e){if(e?.name==='AbortError')return}}
      const ok=await copyText(p.url);tell(ok?'Seu aparelho não abriu o compartilhamento. Link copiado.':'Compartilhamento nativo indisponível.');return;
    }
    const text=encodeURIComponent(`${p.copy.text}\n${tracked}`);
    if(ch==='whatsapp')return popup(`https://wa.me/?text=${text}`);
    if(ch==='facebook')return popup(`https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(tracked)}`);
    if(ch==='x')return popup(`https://twitter.com/intent/tweet?text=${encodeURIComponent(p.copy.text)}&url=${encodeURIComponent(tracked)}`);
    if(ch==='linkedin')return popup(`https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(tracked)}`);
  };

  window.stage16BackToEntity=function(){
    const p=pendingShare;if(!p)return;
    try{window.closeModal?.()}catch{}
    setTimeout(()=>{if(p.type==='opportunity')window.openJob?.(p.id);else window.openPro?.(p.id)},30);
  };

  function unavailable(type){
    if(typeof window.modal!=='function')return;
    const label=normalizeType(type)==='opportunity'?'vaga':'perfil';
    window.modal(`<div class="it-stage16-modal it-stage16-unavailable"><div class="icon">🔗</div><h2>Este ${label} não está disponível</h2><p class="muted">Ele pode ter sido encerrado, despublicado ou o link pode estar incompleto.</p><div class="modal-actions"><button class="btn btn--navy" type="button" onclick="closeModal();go('${normalizeType(type)==='opportunity'?'vagas':'profissionais'}')">Ver ${normalizeType(type)==='opportunity'?'outras vagas':'profissionais'}</button><button class="btn btn--outline" type="button" onclick="closeModal()">Fechar</button></div></div>`);
  }

  async function openDeepLink(){
    if(openingDeepLink)return false;
    const q=new URLSearchParams(window.location.search);
    const job=q.get('vaga'),pro=q.get('profissional');
    let type=null,id=null;
    if(job){type='opportunity';id=job}else if(pro){type='professional';id=pro}else return false;
    if(!uuid.test(String(id||''))){unavailable(type);return false}
    openingDeepLink=true;
    try{
      injectStyles();
      const item=await waitForEntity(type,id);
      if(!item){unavailable(type);return false}
      if(typeof window.go==='function')window.go(type==='opportunity'?'vagas':'profissionais');
      await wait(60);
      if(type==='opportunity'&&typeof window.openJob==='function')window.openJob(id);
      else if(type==='professional'&&typeof window.openPro==='function')window.openPro(id);
      else {unavailable(type);return false}
      setCanonical(type,id,item);
      return true;
    }finally{openingDeepLink=false}
  }

  window.stage16OpenDeepLink=openDeepLink;
  window.addEventListener('popstate',()=>setTimeout(()=>openDeepLink().catch(()=>{}),20));
  window.IntegraTrampoStage16Share={version:1,directUrl,socialUrl,openDeepLink,get pending(){return pendingShare}};

  injectStyles();
  setTimeout(()=>openDeepLink().catch(e=>console.warn('[Stage16 deep link]',e)),120);
})();