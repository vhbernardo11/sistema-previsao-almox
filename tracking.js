// IntegraTrampo · compatibilidade do carregador
// A experiência atual usa apenas login próprio por e-mail/telefone + senha.
(function(){
  if(document.querySelector('script[data-integratrampo-tracking-v6]'))return;
  const s=document.createElement('script');
  s.src='./tracking-v6.js?v=1';
  s.defer=true;
  s.dataset.integratrampoTrackingV6='1';
  document.body.appendChild(s);
})();