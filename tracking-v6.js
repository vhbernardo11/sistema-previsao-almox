// IntegraTrampo · tracking + carregador v14
// Mantém aquisição/UTM e carrega somente o login próprio (e-mail/telefone + senha).
(function(){
  const STORAGE_KEY='it_acquisition_v1';
  const params=new URLSearchParams(window.location.search);
  const referrer=document.referrer||'';

  function hostOf(url){try{return new URL(url).hostname.toLowerCase()}catch{return ''}}
  function inferSource(){
    const explicit=(params.get('utm_source')||params.get('src')||params.get('ref')||'').trim().toLowerCase();
    if(explicit)return explicit.slice(0,120);
    const host=hostOf(referrer);if(!host)return 'direct';
    if(host.includes('instagram.com')||host.includes('l.instagram.com'))return 'instagram';
    if(host.includes('facebook.com')||host.includes('fb.com'))return 'facebook';
    if(host.includes('whatsapp.com')||host.includes('wa.me'))return 'whatsapp';
    if(host.includes('google.'))return 'google';
    if(host.includes('tiktok.com'))return 'tiktok';
    return host.replace(/^www\./,'').slice(0,120)||'referral';
  }
  function clean(value,max=180){const v=(value||'').trim();return v?v.slice(0,max):null}

  const current={
    acquisition_source:clean(inferSource(),120),
    acquisition_medium:clean(params.get('utm_medium')||(referrer?'referral':'direct'),120),
    acquisition_campaign:clean(params.get('utm_campaign'),180),
    acquisition_content:clean(params.get('utm_content'),180),
    acquisition_term:clean(params.get('utm_term'),180),
    referrer_url:clean(referrer,500),
    landing_path:clean(window.location.pathname+window.location.search,500),
    captured_at:new Date().toISOString()
  };

  let stored=null;try{stored=JSON.parse(localStorage.getItem(STORAGE_KEY)||'null')}catch{}
  const hasExplicitCampaign=['utm_source','utm_medium','utm_campaign','utm_content','utm_term','src','ref'].some(k=>params.has(k));
  if(!stored||hasExplicitCampaign){stored=current;try{localStorage.setItem(STORAGE_KEY,JSON.stringify(stored))}catch{}}
  window.IntegraTrampoAcquisition=stored||current;

  if(typeof apiPost==='function'){
    const originalApiPost=apiPost;
    apiPost=function(table,payload){
      if(table==='it_professional_signups'||table==='it_hiring_requests'){
        const a=window.IntegraTrampoAcquisition||{};
        payload={...payload,acquisition_source:a.acquisition_source||'direct',acquisition_medium:a.acquisition_medium||null,acquisition_campaign:a.acquisition_campaign||null,acquisition_content:a.acquisition_content||null,acquisition_term:a.acquisition_term||null,referrer_url:a.referrer_url||null,landing_path:a.landing_path||window.location.pathname};
      }
      return originalApiPost(table,payload);
    };
  }

  function loadScript(key,src,next){
    if(document.querySelector(`script[data-${key}]`)){if(next)next();return}
    const s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute(`data-${key}`,'1');
    s.onload=()=>next&&next();s.onerror=()=>next&&next();document.body.appendChild(s);
  }

  function loadStage10(){loadScript('integratrampo-stage10-activity','./stage10-activity.js?v=1')}
  function loadStage9(){loadScript('integratrampo-stage9-chat','./stage9-chat.js?v=1',loadStage10)}
  function loadStage8(){loadScript('integratrampo-stage8-schedule','./stage8-schedule.js?v=1',loadStage9)}
  function loadStage7(){loadScript('integratrampo-stage7-direct-hiring','./stage7-direct-hiring.js?v=1',loadStage8)}
  function loadStage6(){loadScript('integratrampo-stage6-payments','./stage6-payments.js?v=1',loadStage7)}
  function loadStage5(){loadScript('integratrampo-stage5-safety','./stage5-safety.js?v=1',loadStage6)}
  function loadStage4(){loadScript('integratrampo-stage4-closeout','./stage4-closeout.js?v=1',loadStage5)}
  function loadWhatsAppLayer(){loadScript('integratrampo-whatsapp-v11','./whatsapp-v11.js?v=1',loadStage4)}
  function loadMatchLayer(){loadScript('integratrampo-match-v9','./match-v9.js?v=2',loadWhatsAppLayer)}
  function loadJobCatalog(){loadScript('integratrampo-job-categories-v7','./job-categories-v7.js?v=2',loadMatchLayer)}
  function loadAdminControls(){loadScript('integratrampo-admin-controls-v3','./admin-controls-v3.js?v=1',loadJobCatalog)}
  function loadAdminEnhanced(){loadScript('integratrampo-admin-enhanced','./admin-enhanced.js?v=2',loadAdminControls)}
  function loadAdminLayer(){loadScript('integratrampo-admin','./admin.js?v=3',loadAdminEnhanced)}
  function loadSeoLayer(){loadScript('integratrampo-seo','./seo-init.js?v=1',loadAdminLayer)}
  function loadPremiumLayer(){loadScript('integratrampo-premium','./premium.js?v=1',loadSeoLayer)}
  function loadBabysitterLayer(){loadScript('integratrampo-baba','./categoria-baba.js?v=1',loadPremiumLayer)}
  function loadProfileControlsLayer(){loadScript('integratrampo-profile-controls','./profile-controls-v3.js?v=1',loadBabysitterLayer)}
  function loadOnboardingLayer(){loadScript('integratrampo-onboarding-v3','./onboarding-v3.js?v=1',loadProfileControlsLayer)}
  function loadUserPlusLayer(){loadScript('integratrampo-user-plus','./user-plus.js?v=2',loadOnboardingLayer)}
  function loadUserLayer(){loadScript('integratrampo-user','./user.js?v=3',loadUserPlusLayer)}
  function loadPilotAuth(){loadScript('integratrampo-auth-pilot-v7','./auth-pilot-v7.js?v=1',loadUserLayer)}
  function loadSimpleAuth(){loadScript('integratrampo-auth-simple-v6','./auth-simple-v6.js?v=2',loadPilotAuth)}

  window.addEventListener('load',()=>{
    // auth.js mantém o cliente Supabase e infraestrutura já existente.
    // auth-simple-v6 mantém login/senha; auth-pilot-v7 remove confirmação de cadastro durante o piloto.
    loadScript('integratrampo-auth','./auth.js?v=2',loadSimpleAuth);
  },{once:true});
})();