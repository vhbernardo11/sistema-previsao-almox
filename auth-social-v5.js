// IntegraTrampo · social auth v5
// Complementa auth-v4 com Apple e deixa claro o estado real dos provedores OAuth.
(function(){
  const $id=id=>document.getElementById(id);
  const tell=m=>typeof toast==='function'?toast(m):alert(m);
  let observer=null;

  function injectStyles(){
    if($id('itAuthSocialV5Styles'))return;
    const s=document.createElement('style');
    s.id='itAuthSocialV5Styles';
    s.textContent=`
      .auth4-social{grid-template-columns:repeat(3,minmax(0,1fr))!important}
      .auth5-provider-apple{background:#111;color:#fff;font-size:18px;line-height:1}
      @media(max-width:620px){.auth4-social{grid-template-columns:1fr!important}}
    `;
    document.head.appendChild(s);
  }

  function settings(){
    try{return window.IntegraTrampoAuthV4?.getSettings?.()||{}}catch{return {}}
  }

  function enabled(provider){
    const v=settings()?.external?.[provider];
    return typeof v==='boolean'?v:null;
  }

  function providerLabel(provider){
    return ({google:'Google',facebook:'Facebook',apple:'Apple'})[provider]||provider;
  }

  function ensureAppleButton(){
    const social=document.querySelector('.auth4-social');
    if(!social||$id('auth5Apple'))return;
    const b=document.createElement('button');
    b.type='button';
    b.id='auth5Apple';
    b.innerHTML='<span class="auth4-provider-icon auth5-provider-apple"></span> Apple';
    b.onclick=()=>window.authV5Social('apple');
    social.appendChild(b);
  }

  function refresh(){
    injectStyles();
    ensureAppleButton();
    const map={google:$id('auth4Google'),facebook:$id('auth4Facebook'),apple:$id('auth5Apple')};
    const missing=[];
    Object.entries(map).forEach(([provider,button])=>{
      if(!button)return;
      const state=enabled(provider);
      if(state===false){
        button.disabled=true;
        button.title=`${providerLabel(provider)} ainda não configurado no Supabase`;
        missing.push(providerLabel(provider));
      }else{
        button.disabled=false;
        button.title='';
      }
    });
    const status=$id('auth4ProviderStatus');
    if(status){
      status.textContent=missing.length
        ? `${missing.join(', ').replace(/, ([^,]*)$/,' e $1')}: configuração externa ainda pendente.`
        : '';
    }
  }

  window.authV5Social=async function(provider){
    const sb=window.IntegraTrampoSupabase;
    if(!sb){tell('A autenticação ainda está carregando.');return}
    const state=enabled(provider);
    if(state===false){
      tell(`${providerLabel(provider)} ainda precisa ser ativado na configuração de autenticação.`);
      refresh();
      return;
    }
    const id=provider==='google'?'auth4Google':provider==='facebook'?'auth4Facebook':'auth5Apple';
    const button=$id(id);
    const old=button?.innerHTML;
    if(button){button.disabled=true;button.textContent='Abrindo...'}
    try{
      const options={redirectTo:`${window.location.origin}${window.location.pathname}`};
      if(provider==='google')options.queryParams={prompt:'select_account'};
      const {error}=await sb.auth.signInWithOAuth({provider,options});
      if(error)throw error;
    }catch(error){
      const msg=String(error?.message||error||'');
      if(/provider.*not enabled|unsupported provider/i.test(msg))tell(`${providerLabel(provider)} ainda não foi ativado no Supabase.`);
      else tell(`Não foi possível entrar com ${providerLabel(provider)} agora: ${msg}`);
      if(button&&old){button.disabled=false;button.innerHTML=old}
      refresh();
    }
  };

  function patchLegacySocialHandler(){
    // auth-v4 já aceita qualquer provider no Supabase, mas escolhe o botão errado para Apple.
    // Mantemos Google/Facebook no handler novo também para um comportamento único.
    window.authV4Social=window.authV5Social;
  }

  function start(){
    injectStyles();
    patchLegacySocialHandler();
    refresh();
    if(observer)return;
    observer=new MutationObserver(()=>refresh());
    observer.observe(document.documentElement,{subtree:true,childList:true});
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});
  else start();
})();
