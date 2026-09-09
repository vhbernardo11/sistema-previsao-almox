// IntegraTrampo · catálogo único de áreas/vagas v7.2
// Página inicial, cadastro profissional e pedido de contratação usam a mesma lista.
// Atualização idempotente: evita loops de MutationObserver e travamentos no celular.
(function(){
  const CATALOG=[
    ['🍽️','Garçom'],['🍸','Barman'],['🍔','Chapeiro'],['🍳','Auxiliar de cozinha'],['🔥','Churrasqueiro'],
    ['🧹','Diarista'],['🧽','Faxineira'],['🧼','Limpeza'],['✨','Limpeza de eventos'],['🛎️','Recepção'],
    ['⚡','Eletricista'],['🚰','Encanador'],['🎨','Pintor'],['🖌️','Pintor residencial'],['🌿','Jardineiro'],
    ['🛡️','Segurança de eventos'],['🚪','Controlador de acesso'],['👁️','Vigia'],['🛡️','Vigilante'],
    ['🧰','Serviços gerais'],['👶','Babá'],['🤝','Cuidadora'],['•••','Outros']
  ];
  const names=CATALOG.map(x=>x[1]);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.IntegraTrampoJobCategories=CATALOG.map(([icon,name])=>({icon,name}));
  let syncQueued=false;

  function sameArray(a,b){return a.length===b.length&&a.every((v,i)=>v===b[i])}

  function fillSelect(select,keepPlaceholder=true){
    if(!select)return false;
    const current=select.value;
    const first=select.options?.[0];
    const placeholder=keepPlaceholder&&first&&first.value===''?(first.textContent||'Selecione'):'Selecione';
    const wantedValues=keepPlaceholder?['',...names]:[...names];
    const existingValues=[...select.options].map(o=>o.value);
    if(sameArray(existingValues,wantedValues))return false;

    const prefix=keepPlaceholder?`<option value="">${esc(placeholder)}</option>`:'';
    select.innerHTML=prefix+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if(names.includes(current)||current==='')select.value=current;
    return true;
  }

  function renderHomeCategories(){
    const grid=document.getElementById('categoryGrid');if(!grid)return false;
    const existing=[...grid.querySelectorAll('.category b')].map(b=>b.textContent.trim());
    if(sameArray(existing,names)&&grid.dataset.itCatalogV7==='1')return false;

    grid.innerHTML=CATALOG.map(([icon,name])=>`<button class="category" type="button" data-it-category="${esc(name)}"><span class="category__icon">${icon}</span><b>${esc(name)}</b></button>`).join('');
    grid.dataset.itCatalogV7='1';
    grid.querySelectorAll('[data-it-category]').forEach(btn=>btn.addEventListener('click',()=>{
      const name=btn.dataset.itCategory;
      if(window.IntegraTrampoUICoreV8?.navigate)window.IntegraTrampoUICoreV8.navigate('vagas');
      else if(typeof window.go==='function')window.go('vagas');
      const sel=document.getElementById('jobCategory');if(sel){fillSelect(sel,true);sel.value=name}
      if(typeof window.renderJobs==='function')window.renderJobs();
    }));
    return true;
  }

  function rebuildWorkerChips(){
    const grid=document.querySelector('.work-chip-grid');if(!grid||grid.dataset.itCatalogV7==='1')return false;
    const selected=new Set([...grid.querySelectorAll('[data-work-category].is-selected')].map(x=>x.dataset.workCategory));
    grid.innerHTML=CATALOG.map(([icon,name])=>`<button type="button" class="work-chip ${selected.has(name)?'is-selected':''}" data-work-category="${esc(name)}" aria-pressed="${selected.has(name)?'true':'false'}"><span class="work-chip__icon">${icon}</span><span>${esc(name)}</span></button>`).join('');
    grid.querySelectorAll('[data-work-category]').forEach(btn=>btn.addEventListener('click',()=>{const on=!btn.classList.contains('is-selected');btn.classList.toggle('is-selected',on);btn.setAttribute('aria-pressed',String(on))}));
    grid.dataset.itCatalogV7='1';return true;
  }

  function rebuildProfileChips(){
    const grid=document.querySelector('.pc-chip-grid');if(!grid||grid.dataset.itCatalogV7==='1')return false;
    const selected=new Set([...grid.querySelectorAll('[data-pc-cat].is-selected')].map(x=>x.dataset.pcCat));
    grid.innerHTML=CATALOG.map(([icon,name])=>`<button type="button" class="pc-chip ${selected.has(name)?'is-selected':''}" data-pc-cat="${esc(name)}" aria-pressed="${selected.has(name)?'true':'false'}"><span>${icon}</span><span>${esc(name)}</span></button>`).join('');
    grid.querySelectorAll('[data-pc-cat]').forEach(btn=>btn.addEventListener('click',()=>{const on=!btn.classList.contains('is-selected');btn.classList.toggle('is-selected',on);btn.setAttribute('aria-pressed',String(on))}));
    grid.dataset.itCatalogV7='1';return true;
  }

  function syncOpenForms(){
    const h=document.getElementById('hCat');if(h)fillSelect(h,false);
    const w=document.getElementById('wRole');if(w)fillSelect(w,false);
    rebuildWorkerChips();rebuildProfileChips();
  }

  function queueSync(){
    if(syncQueued)return;syncQueued=true;
    requestAnimationFrame(()=>{syncQueued=false;syncOpenForms()});
  }

  function patchFunctions(){
    if(typeof window.renderCategories==='function'&&!window.renderCategories.__itCatalogV7){
      const prev=window.renderCategories;
      const wrapped=function(...args){const out=prev.apply(this,args);renderHomeCategories();return out};
      wrapped.__itCatalogV7=true;window.renderCategories=wrapped;
    }
    ['hiringModal','workerModal','editMyProfile'].forEach(name=>{
      const prev=window[name];if(typeof prev!=='function'||prev.__itCatalogV7)return;
      const wrapped=function(...args){
        const out=prev.apply(this,args);
        Promise.resolve(out).then(()=>queueSync(),()=>queueSync());
        return out;
      };
      wrapped.__itCatalogV7=true;window[name]=wrapped;
    });
  }

  function apply(){patchFunctions();renderHomeCategories();syncOpenForms()}
  const observer=new MutationObserver(()=>queueSync());
  observer.observe(document.documentElement,{subtree:true,childList:true});
  apply();
  // Scripts do IntegraTrampo são carregados em camadas; durante alguns segundos
  // verificamos se alguma camada posterior substituiu uma função que precisa do catálogo.
  let tries=0;const timer=setInterval(()=>{patchFunctions();renderHomeCategories();if(++tries>=40)clearInterval(timer)},250);
  window.addEventListener('pageshow',()=>setTimeout(apply,0));
})();
