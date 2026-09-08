// IntegraTrampo · núcleo de interação v8
// Roteia cliques principais por delegação, sempre chamando a versão mais recente
// das funções globais. Também expõe um diagnóstico leve da interface.
(function(){
  if(window.IntegraTrampoUICoreV8)return;

  const REQUIRED_SCREENS=['home','vagas','profissionais','empresas','painel','operacao'];
  const REQUIRED_STATIC={
    workerBtn:'workerModal',
    hireBtn:'hiringModal',
    hireBtn2:'hiringModal',
    notifyBtn:'notificationModal',
    loginBtn:'loginModal'
  };
  const runtimeErrors=[];

  function notify(message){
    try{if(typeof window.toast==='function'){window.toast(message);return}}catch{}
    console.warn('[IntegraTrampo UI]',message);
  }

  function callLatest(name,...args){
    const fn=window[name];
    if(typeof fn!=='function'){
      runtimeErrors.push({type:'missing_function',name,at:new Date().toISOString()});
      notify('Esta função ainda está carregando. Tente novamente em um instante.');
      return false;
    }
    try{
      const out=fn.apply(window,args);
      if(out&&typeof out.catch==='function')out.catch(err=>{
        console.error(`[IntegraTrampo UI] ${name} rejeitou`,err);
        runtimeErrors.push({type:'async_error',name,message:String(err?.message||err),at:new Date().toISOString()});
        notify('Não foi possível concluir esta ação agora.');
      });
      return true;
    }catch(err){
      console.error(`[IntegraTrampo UI] ${name} falhou`,err);
      runtimeErrors.push({type:'sync_error',name,message:String(err?.message||err),at:new Date().toISOString()});
      notify('Não foi possível abrir esta função agora.');
      return false;
    }
  }

  function fallbackGo(id){
    const target=document.getElementById(`screen-${id}`);
    if(!target)return false;
    document.querySelectorAll('.screen').forEach(x=>x.classList.toggle('is-active',x===target));
    document.querySelectorAll('[data-nav]').forEach(x=>x.classList.toggle('is-active',x.dataset.nav===id));
    try{window.scrollTo({top:0,behavior:'smooth'})}catch{window.scrollTo(0,0)}
    if(id==='painel'&&typeof window.renderPanel==='function')callLatest('renderPanel');
    if(id==='operacao'&&typeof window.renderOps==='function')callLatest('renderOps');
    return true;
  }

  function navigate(id){
    if(!REQUIRED_SCREENS.includes(id))return false;
    if(typeof window.go==='function')return callLatest('go',id);
    return fallbackGo(id);
  }

  // Captura antes dos handlers antigos. Isso evita referências antigas de .onclick
  // e garante que cada botão principal execute uma única ação.
  document.addEventListener('click',event=>{
    const el=event.target.closest('button,a,[data-go]');
    if(!el)return;

    const goTo=el.dataset?.go;
    if(goTo){
      event.preventDefault();
      event.stopImmediatePropagation();
      navigate(goTo);
      return;
    }

    const action=REQUIRED_STATIC[el.id];
    if(action){
      event.preventDefault();
      event.stopImmediatePropagation();
      callLatest(action);
      return;
    }

    if(el.id==='clearJobs'){
      event.preventDefault();event.stopImmediatePropagation();
      const q=document.getElementById('jobQuery'),c=document.getElementById('jobCategory'),o=document.getElementById('jobOrder');
      if(q)q.value='';if(c)c.value='';if(o)o.value='match';callLatest('renderJobs');return;
    }
    if(el.id==='clearPros'){
      event.preventDefault();event.stopImmediatePropagation();
      const q=document.getElementById('proQuery'),c=document.getElementById('proCategory'),o=document.getElementById('proOrder');
      if(q)q.value='';if(c)c.value='';if(o)o.value='match';callLatest('renderPros');return;
    }
  },true);

  document.addEventListener('input',event=>{
    if(event.target?.id==='jobQuery')callLatest('renderJobs');
    if(event.target?.id==='proQuery')callLatest('renderPros');
  },true);
  document.addEventListener('change',event=>{
    if(['jobCategory','jobOrder'].includes(event.target?.id))callLatest('renderJobs');
    if(['proCategory','proOrder'].includes(event.target?.id))callLatest('renderPros');
  },true);

  window.addEventListener('error',event=>{
    runtimeErrors.push({type:'window_error',message:String(event.message||event.error||'erro'),source:event.filename||'',line:event.lineno||0,at:new Date().toISOString()});
  });
  window.addEventListener('unhandledrejection',event=>{
    runtimeErrors.push({type:'unhandled_rejection',message:String(event.reason?.message||event.reason||'rejeição'),at:new Date().toISOString()});
  });

  function extractInlineFunctions(){
    const found=new Set();
    document.querySelectorAll('[onclick],[onchange],[oninput]').forEach(el=>{
      for(const attr of ['onclick','onchange','oninput']){
        const code=el.getAttribute(attr)||'';
        const re=/\b([A-Za-z_$][\w$]*)\s*\(/g;let m;
        while((m=re.exec(code))){
          const name=m[1];
          if(!['if','for','while','switch','function','setTimeout','setInterval'].includes(name))found.add(name);
        }
      }
    });
    return [...found];
  }

  function report(){
    const issues=[];
    for(const id of REQUIRED_SCREENS){if(!document.getElementById(`screen-${id}`))issues.push(`Tela ausente: ${id}`)}
    for(const [id,fn] of Object.entries(REQUIRED_STATIC)){
      if(!document.getElementById(id))issues.push(`Botão ausente: #${id}`);
      if(typeof window[fn]!=='function')issues.push(`Função ausente: ${fn}`);
    }
    document.querySelectorAll('[data-go]').forEach(el=>{
      const id=el.dataset.go;if(id&&!document.getElementById(`screen-${id}`))issues.push(`Navegação inválida: ${id}`);
    });
    for(const name of extractInlineFunctions()){
      if(name==='document'||name==='window'||name==='console')continue;
      if(typeof window[name]!=='function'&&typeof window[name]!=='object')issues.push(`Handler inline inexistente: ${name}`);
    }
    const result={ok:issues.length===0,issues:[...new Set(issues)],runtimeErrors:[...runtimeErrors],checkedAt:new Date().toISOString()};
    if(!result.ok)console.warn('[IntegraTrampo UI Health]',result);else console.info('[IntegraTrampo UI Health] OK',result);
    return result;
  }

  window.IntegraTrampoUICoreV8={navigate,callLatest,report,get errors(){return [...runtimeErrors]}};
  setTimeout(report,4500);
})();
