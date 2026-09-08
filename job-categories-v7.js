// IntegraTrampo · catálogo único de áreas/vagas v7
// Página inicial, cadastro profissional e pedido de contratação usam a mesma lista.
(function(){
  const CATALOG=[
    ['🍽️','Garçom'],['🍸','Barman'],['🍔','Chapeiro'],['🍳','Auxiliar de cozinha'],['🔥','Churrasqueiro'],
    ['🧹','Diarista'],['🧽','Faxineira'],['🧼','Limpeza'],['✨','Limpeza de eventos'],['🛎️','Recepção'],
    ['⚡','Eletricista'],['🚰','Encanador'],['🎨','Pintor'],['🖌️','Pintor residencial'],['🌿','Jardineiro'],
    ['🛡️','Segurança de eventos'],['🚪','Controlador de acesso'],['👁️','Vigia'],['🛡️','Vigilante'],
    ['🧰','Serviços gerais'],['👶','Babá'],['•••','Outros']
  ];
  const names=CATALOG.map(x=>x[1]);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  window.IntegraTrampoJobCategories=CATALOG.map(([icon,name])=>({icon,name}));

  function fillSelect(select,keepPlaceholder=true){
    if(!select)return;
    const current=select.value;
    let prefix='';
    if(keepPlaceholder){const first=select.options?.[0];if(first&&first.value==='')prefix=`<option value="">${esc(first.textContent||'Selecione')}</option>`}
    select.innerHTML=prefix+names.map(n=>`<option value="${esc(n)}">${esc(n)}</option>`).join('');
    if(names.includes(current))select.value=current;
  }

  function renderHomeCategories(){
    const grid=document.getElementById('categoryGrid');if(!grid)return;
    grid.innerHTML=CATALOG.map(([icon,name])=>`<button class="category" type="button" data-it-category="${esc(name)}"><span class="category__icon">${icon}</span><b>${esc(name)}</b></button>`).join('');
    grid.querySelectorAll('[data-it-category]').forEach(btn=>btn.addEventListener('click',()=>{
      const name=btn.dataset.itCategory;
      if(typeof go==='function')go('vagas');
      const sel=document.getElementById('jobCategory');if(sel){fillSelect(sel,true);sel.value=name}
      if(typeof renderJobs==='function')renderJobs();
    }));
  }

  function rebuildWorkerChips(){
    const grid=document.querySelector('.work-chip-grid');if(!grid||grid.dataset.itCatalogV7==='1')return;
    const selected=new Set([...grid.querySelectorAll('[data-work-category].is-selected')].map(x=>x.dataset.workCategory));
    grid.innerHTML=CATALOG.map(([icon,name])=>`<button type="button" class="work-chip ${selected.has(name)?'is-selected':''}" data-work-category="${esc(name)}" aria-pressed="${selected.has(name)?'true':'false'}"><span class="work-chip__icon">${icon}</span><span>${esc(name)}</span></button>`).join('');
    grid.querySelectorAll('[data-work-category]').forEach(btn=>btn.addEventListener('click',()=>{const on=!btn.classList.contains('is-selected');btn.classList.toggle('is-selected',on);btn.setAttribute('aria-pressed',String(on))}));
    grid.dataset.itCatalogV7='1';
  }

  function rebuildProfileChips(){
    const grid=document.querySelector('.pc-chip-grid');if(!grid||grid.dataset.itCatalogV7==='1')return;
    const selected=new Set([...grid.querySelectorAll('[data-pc-cat].is-selected')].map(x=>x.dataset.pcCat));
    grid.innerHTML=CATALOG.map(([icon,name])=>`<button type="button" class="pc-chip ${selected.has(name)?'is-selected':''}" data-pc-cat="${esc(name)}" aria-pressed="${selected.has(name)?'true':'false'}"><span>${icon}</span><span>${esc(name)}</span></button>`).join('');
    grid.querySelectorAll('[data-pc-cat]').forEach(btn=>btn.addEventListener('click',()=>{const on=!btn.classList.contains('is-selected');btn.classList.toggle('is-selected',on);btn.setAttribute('aria-pressed',String(on))}));
    grid.dataset.itCatalogV7='1';
  }

  function syncOpenForms(){
    const h=document.getElementById('hCat');if(h)fillSelect(h,false);
    const w=document.getElementById('wRole');if(w)fillSelect(w,false);
    rebuildWorkerChips();rebuildProfileChips();
  }

  function patchFunctions(){
    if(typeof window.renderCategories==='function'&&!window.renderCategories.__itCatalogV7){
      const prev=window.renderCategories;const wrapped=function(...args){const out=prev.apply(this,args);renderHomeCategories();return out};wrapped.__itCatalogV7=true;window.renderCategories=wrapped;
    }
    ['hiringModal','workerModal','editMyProfile'].forEach(name=>{
      const prev=window[name];if(typeof prev!=='function'||prev.__itCatalogV7)return;
      const wrapped=async function(...args){const out=await prev.apply(this,args);setTimeout(syncOpenForms,0);return out};wrapped.__itCatalogV7=true;window[name]=wrapped;
    });
  }

  function apply(){patchFunctions();renderHomeCategories();syncOpenForms()}
  const observer=new MutationObserver(()=>syncOpenForms());observer.observe(document.documentElement,{subtree:true,childList:true});
  apply();let tries=0;const timer=setInterval(()=>{apply();if(++tries>=80)clearInterval(timer)},250);
  window.addEventListener('pageshow',()=>setTimeout(apply,0));
})();
