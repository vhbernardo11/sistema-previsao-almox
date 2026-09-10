// IntegraTrampo · WhatsApp automático · etapa 3 v11
// Dispara eventos do match/confirmação via Edge Function + Meta WhatsApp Cloud API.
// As credenciais Meta ficam somente no backend do Supabase.
(function(){
  if(window.IntegraTrampoWhatsAppV11)return;

  let sb=null;
  let configured=null;
  let lastStatusCheck=0;
  let dispatching=false;
  let lastDispatch=0;
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  async function waitForSupabase(){
    for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);
    sb=window.IntegraTrampoSupabase||null;
    return sb;
  }

  async function currentUser(){
    if(!sb)await waitForSupabase();
    if(!sb)return null;
    try{const {data}=await sb.auth.getUser();return data?.user||null}catch{return null}
  }

  async function checkStatus(force=false){
    if(!sb)await waitForSupabase();
    if(!sb)return false;
    const user=await currentUser();
    if(!user){configured=null;renderBadge();return false}
    const now=Date.now();
    if(!force&&configured!==null&&now-lastStatusCheck<120000)return configured;
    lastStatusCheck=now;
    try{
      const {data,error}=await sb.functions.invoke('integratrampo-whatsapp',{body:{action:'status'}});
      if(error)throw error;
      configured=!!data?.configured;
    }catch(e){
      console.warn('[IntegraTrampo WhatsApp] status indisponível',e);
      configured=false;
    }
    renderBadge();
    return configured;
  }

  async function dispatch(reason='background'){
    if(dispatching)return null;
    if(Date.now()-lastDispatch<1200)return null;
    const user=await currentUser();
    if(!user)return null;
    const ready=await checkStatus();
    if(!ready)return {configured:false,sent:0,failed:0};
    dispatching=true;lastDispatch=Date.now();
    try{
      const {data,error}=await sb.functions.invoke('integratrampo-whatsapp',{body:{action:'dispatch',reason}});
      if(error)throw error;
      if(Number(data?.sent||0)>0&&typeof window.toast==='function')window.toast(`💬 ${Number(data.sent)} aviso(s) enviado(s) pelo WhatsApp`);
      if(Number(data?.failed||0)>0)console.warn('[IntegraTrampo WhatsApp] falhas temporárias',data.failed);
      return data||null;
    }catch(e){
      console.warn('[IntegraTrampo WhatsApp] envio adiado',e);
      return null;
    }finally{dispatching=false;renderBadge()}
  }

  function renderBadge(){
    const stage=document.getElementById('itMatchStage1');
    if(!stage)return;
    let badge=stage.querySelector('[data-it-whatsapp-status]');
    if(!badge){
      const head=stage.querySelector('.it-match-stage__head');
      if(!head)return;
      badge=document.createElement('div');
      badge.setAttribute('data-it-whatsapp-status','1');
      badge.style.cssText='width:100%;font-size:12px;font-weight:800;margin-top:2px;padding:8px 10px;border-radius:10px;background:#f5f8fb;color:#52606d';
      head.insertAdjacentElement('afterend',badge);
    }
    if(configured===true){
      badge.textContent='💬 WhatsApp automático ativo para match e confirmações.';
      badge.style.background='#eafaf4';badge.style.color='#087858';
    }else if(configured===false){
      badge.textContent='💬 WhatsApp automático preparado. A ativação depende das credenciais e do template aprovado na Meta.';
      badge.style.background='#fff7e5';badge.style.color='#8a5a00';
    }else{
      badge.textContent='💬 Verificando WhatsApp automático…';
    }
  }

  function wrap(name,reasonResolver){
    const prev=window[name];
    if(typeof prev!=='function'||prev.__itWhatsAppV11)return;
    const wrapped=async function(...args){
      const result=await prev.apply(this,args);
      try{
        const reason=typeof reasonResolver==='function'?reasonResolver(args):String(reasonResolver||name);
        setTimeout(()=>dispatch(reason),220);
      }catch{}
      return result;
    };
    wrapped.__itWhatsAppV11=true;
    wrapped.__itWhatsAppPrevious=prev;
    window[name]=wrapped;
  }

  function patchActions(){
    wrap('setApplicationStatus',args=>args?.[1]==='selected'?'match_created':'application_status');
    wrap('confirmMyService','service_confirmation');
    wrap('cancelMyServiceV10','service_cancelled');
  }

  function observeMatchStage(){
    if(!document.body)return;
    const observer=new MutationObserver(()=>renderBadge());
    observer.observe(document.body,{childList:true,subtree:true});
  }

  async function init(){
    await waitForSupabase();
    if(!sb)return;
    patchActions();
    let tries=0;const patchTimer=setInterval(()=>{patchActions();if(++tries>=28)clearInterval(patchTimer)},250);
    observeMatchStage();
    await checkStatus(true);
    setTimeout(()=>dispatch('page_open'),700);

    sb.auth.onAuthStateChange((_event,session)=>{
      configured=null;lastStatusCheck=0;
      setTimeout(async()=>{
        patchActions();
        if(session?.user){await checkStatus(true);await dispatch('auth_state')}
        else renderBadge();
      },300);
    });

    window.addEventListener('focus',()=>setTimeout(()=>dispatch('window_focus'),250));
    setInterval(()=>{if(document.visibilityState==='visible')dispatch('periodic_retry')},300000);
  }

  window.IntegraTrampoWhatsAppV11={
    version:11,
    checkStatus,
    dispatch,
    get configured(){return configured}
  };

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
