// IntegraTrampo · bootstrap de compatibilidade v24
// Carrega primeiro o núcleo de interação (botões/navegação) e depois as demais camadas.
(function(){
  function load(key,src,next){
    if(document.querySelector(`script[data-${key}]`)){if(next)next();return}
    const s=document.createElement('script');s.src=src;s.defer=true;s.setAttribute(`data-${key}`,'1');
    s.onload=()=>next&&next();s.onerror=()=>{console.error('[IntegraTrampo] Falha ao carregar',src);next&&next()};
    document.body.appendChild(s);
  }
  load('integratrampo-ui-core-v8','./ui-core-v8.js?v=1',()=>{
    load('integratrampo-tracking-v6','./tracking-v6.js?v=22');
  });
})();