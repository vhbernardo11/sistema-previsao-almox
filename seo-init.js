// IntegraTrampo · SEO local base
(function(){
  const BASE='https://integratrampo-live-v3-vitor-hugo-bernardos-projects.vercel.app/';
  const TITLE='IntegraTrampo | Trabalho, vagas e serviços em Teodoro Sampaio';
  const DESC='Encontre vagas, profissionais e serviços locais em Teodoro Sampaio - SP. A IntegraTrampo aproxima quem precisa de trabalho de quem precisa de gente.';
  document.title=TITLE;
  const meta=(attr,name,value)=>{let el=document.querySelector(`meta[${attr}="${name}"]`);if(!el){el=document.createElement('meta');el.setAttribute(attr,name);document.head.appendChild(el)}el.setAttribute('content',value)};
  meta('name','description',DESC);meta('name','robots','index,follow,max-image-preview:large');
  meta('property','og:type','website');meta('property','og:locale','pt_BR');meta('property','og:title',TITLE);meta('property','og:description',DESC);meta('property','og:url',BASE);meta('property','og:site_name','IntegraTrampo');
  meta('name','twitter:card','summary');meta('name','twitter:title',TITLE);meta('name','twitter:description',DESC);
  let canonical=document.querySelector('link[rel="canonical"]');if(!canonical){canonical=document.createElement('link');canonical.rel='canonical';document.head.appendChild(canonical)}canonical.href=BASE;
  if(!document.getElementById('integratrampoSchema')){const s=document.createElement('script');s.type='application/ld+json';s.id='integratrampoSchema';s.textContent=JSON.stringify({'@context':'https://schema.org','@graph':[{'@type':'Organization','@id':BASE+'#organization','name':'IntegraTrampo','url':BASE,'description':DESC,'areaServed':{'@type':'City','name':'Teodoro Sampaio','addressRegion':'SP','addressCountry':'BR'}},{'@type':'WebSite','@id':BASE+'#website','url':BASE,'name':'IntegraTrampo','inLanguage':'pt-BR','publisher':{'@id':BASE+'#organization'}}]});document.head.appendChild(s)}
})();