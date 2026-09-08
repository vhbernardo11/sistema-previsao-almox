// IntegraTrampo · rastreamento de aquisição (primeiro toque + UTM)
// Mantém o campo técnico `source` intacto e adiciona contexto de marketing
// somente aos cadastros reais enviados para o Supabase.
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

  function loadAdminLayer(){
    if(document.querySelector('script[data-integratrampo-admin]'))return;
    const s=document.createElement('script');s.src='./admin.js?v=2';s.defer=true;s.dataset.integratrampoAdmin='1';document.body.appendChild(s);
  }
  function loadPremiumLayer(){
    if(document.querySelector('script[data-integratrampo-premium]')){loadAdminLayer();return}
    const s=document.createElement('script');s.src='./premium.js?v=1';s.defer=true;s.dataset.integratrampoPremium='1';s.onload=loadAdminLayer;s.onerror=loadAdminLayer;document.body.appendChild(s);
  }
  function loadUserPlusLayer(){
    if(document.querySelector('script[data-integratrampo-user-plus]')){loadPremiumLayer();return}
    const s=document.createElement('script');s.src='./user-plus.js?v=1';s.defer=true;s.dataset.integratrampoUserPlus='1';s.onload=loadPremiumLayer;s.onerror=loadPremiumLayer;document.body.appendChild(s);
  }
  function loadUserLayer(){
    if(document.querySelector('script[data-integratrampo-user]')){loadUserPlusLayer();return}
    const s=document.createElement('script');s.src='./user.js?v=2';s.defer=true;s.dataset.integratrampoUser='1';s.onload=loadUserPlusLayer;s.onerror=loadUserPlusLayer;document.body.appendChild(s);
  }
  window.addEventListener('load',()=>{
    if(document.querySelector('script[data-integratrampo-auth]')){loadUserLayer();return}
    const s=document.createElement('script');s.src='./auth.js?v=1';s.defer=true;s.dataset.integratrampoAuth='1';s.onload=loadUserLayer;s.onerror=loadUserLayer;document.body.appendChild(s);
  },{once:true});
})();