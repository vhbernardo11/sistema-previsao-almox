// IntegraTrampo · categoria Babá
// Adiciona Babá à vitrine, filtros, cadastro profissional e edição de perfil
// sem duplicar opções existentes.
(function(){
  const NAME='Babá';
  const ICON='👶';

  function addSelectOption(id){
    const sel=document.getElementById(id);if(!sel)return;
    if([...sel.options].some(o=>o.value===NAME||o.textContent.trim()===NAME))return;
    const opt=document.createElement('option');opt.value=NAME;opt.textContent=NAME;
    const outros=[...sel.options].find(o=>o.value==='Outros'||o.textContent.trim()==='Outros');
    if(outros)sel.insertBefore(opt,outros);else sel.appendChild(opt);
  }

  function addHomeCategory(){
    const grid=document.getElementById('categoryGrid');if(!grid)return;
    if([...grid.querySelectorAll('.category b')].some(b=>b.textContent.trim()===NAME))return;
    const btn=document.createElement('button');btn.className='category';btn.type='button';
    btn.innerHTML=`<span class="category__icon">${ICON}</span><b>${NAME}</b>`;
    btn.onclick=()=>{if(typeof go==='function')go('vagas');addSelectOption('jobCategory');const s=document.getElementById('jobCategory');if(s)s.value=NAME;if(typeof renderJobs==='function')renderJobs()};
    const outros=[...grid.querySelectorAll('.category')].find(x=>x.querySelector('b')?.textContent.trim()==='Outros');
    if(outros)grid.insertBefore(btn,outros);else grid.appendChild(btn);
  }

  function addWorkerChip(){
    const grid=document.querySelector('.work-chip-grid');if(!grid)return;
    if(grid.querySelector(`[data-work-category="${NAME}"]`))return;
    const btn=document.createElement('button');btn.type='button';btn.className='work-chip';btn.dataset.workCategory=NAME;btn.setAttribute('aria-pressed','false');
    btn.innerHTML=`<span class="work-chip__icon">${ICON}</span><span>${NAME}</span>`;
    btn.addEventListener('click',()=>{const on=!btn.classList.contains('is-selected');btn.classList.toggle('is-selected',on);btn.setAttribute('aria-pressed',String(on))});
    const outros=grid.querySelector('[data-work-category="Outros"]');if(outros)grid.insertBefore(btn,outros);else grid.appendChild(btn);
  }

  function addProfileChip(){
    const grid=document.querySelector('.pc-chip-grid');if(!grid)return;
    if(grid.querySelector(`[data-pc-cat="${NAME}"]`))return;
    const btn=document.createElement('button');btn.type='button';btn.className='pc-chip';btn.dataset.pcCat=NAME;btn.setAttribute('aria-pressed','false');
    btn.innerHTML=`<span>${ICON}</span><span>${NAME}</span>`;
    btn.addEventListener('click',()=>{const on=!btn.classList.contains('is-selected');btn.classList.toggle('is-selected',on);btn.setAttribute('aria-pressed',String(on))});
    const outros=grid.querySelector('[data-pc-cat="Outros"]');if(outros)grid.insertBefore(btn,outros);else grid.appendChild(btn);
  }

  function patchFunctions(){
    if(typeof window.renderCategories==='function'&&!window.renderCategories.__babaPatched){
      const prev=window.renderCategories;const wrapped=function(...args){const r=prev.apply(this,args);addHomeCategory();addSelectOption('jobCategory');addSelectOption('proCategory');return r};wrapped.__babaPatched=true;window.renderCategories=wrapped;
    }
    if(typeof window.workerModal==='function'&&!window.workerModal.__babaPatched){
      const prev=window.workerModal;const wrapped=async function(...args){const r=await prev.apply(this,args);setTimeout(addWorkerChip,0);return r};wrapped.__babaPatched=true;window.workerModal=wrapped;
    }
    if(typeof window.editMyProfile==='function'&&!window.editMyProfile.__babaPatched){
      const prev=window.editMyProfile;const wrapped=async function(...args){const r=await prev.apply(this,args);setTimeout(addProfileChip,0);return r};wrapped.__babaPatched=true;window.editMyProfile=wrapped;
    }
  }

  function apply(){patchFunctions();addHomeCategory();addSelectOption('jobCategory');addSelectOption('proCategory');addWorkerChip();addProfileChip()}
  apply();
  setTimeout(apply,250);
  setTimeout(apply,900);
})();