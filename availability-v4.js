// IntegraTrampo · disponibilidade semanal v4.1
// Disponibilidade do profissional = dias da semana. Horários exatos pertencem às vagas.
(function(){
  const WEEK=[['mon','Segunda','Seg'],['tue','Terça','Ter'],['wed','Quarta','Qua'],['thu','Quinta','Qui'],['fri','Sexta','Sex'],['sat','Sábado','Sáb'],['sun','Domingo','Dom']];
  const ALL=WEEK.map(x=>x[0]);
  let wrapped=false;

  function injectStyles(){
    if(document.getElementById('itAvailabilityV4Styles'))return;
    const s=document.createElement('style');
    s.id='itAvailabilityV4Styles';
    s.textContent=`
      .av4-help{font-size:12px;color:#64748b;line-height:1.45;margin:7px 0 10px}
      .schedule-box.av4-days,.pc-schedule.av4-days,.ac3-schedule.av4-days{display:grid!important;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px!important}
      .schedule-row.av4-day,.pc-schedule-row.av4-day,.ac3-row.av4-day{display:block!important;border:1px solid #dbe4ee!important;border-radius:14px!important;padding:0!important;background:#fff!important;overflow:hidden}
      .schedule-row.av4-day label,.pc-schedule-row.av4-day label,.ac3-row.av4-day label{display:flex!important;align-items:center!important;gap:9px!important;min-height:48px!important;padding:10px 12px!important;font-weight:850!important;color:#0D1B2A!important;cursor:pointer!important}
      .schedule-row.av4-day.is-selected,.pc-schedule-row.av4-day.is-selected,.ac3-row.av4-day.is-selected{border-color:#16B898!important;background:#ecfdf8!important;box-shadow:0 0 0 1px #16B898 inset!important}
      .schedule-row.av4-day input[type=checkbox],.pc-schedule-row.av4-day input[type=checkbox],.ac3-row.av4-day input[type=checkbox]{width:19px!important;height:19px!important;accent-color:#16B898!important}
      .schedule-row.av4-day input[type=time],.pc-schedule-row.av4-day input[type=time],.ac3-row.av4-day input[type=time],.schedule-row.av4-day .schedule-sep,.pc-schedule-row.av4-day>span,.ac3-row.av4-day>span{display:none!important}
      .quick-schedule.av4-quick,.pc-quick.av4-quick,.ac3-quick.av4-quick{gap:7px!important;margin:8px 0 10px!important}
      .quick-schedule.av4-quick button,.pc-quick.av4-quick button,.ac3-quick.av4-quick button{background:#fff!important;border:1px solid #dbe4ee!important;border-radius:999px!important;padding:8px 11px!important}
      @media(max-width:390px){.schedule-box.av4-days,.pc-schedule.av4-days,.ac3-schedule.av4-days{grid-template-columns:1fr 1fr!important}}
    `;
    document.head.appendChild(s);
  }

  function selectedCodes(root=document){
    return [...root.querySelectorAll('[data-schedule-day],[data-pc-day],[data-ac3-day]')]
      .filter(row=>row.querySelector('input[type=checkbox]')?.checked)
      .map(row=>row.dataset.scheduleDay||row.dataset.pcDay||row.dataset.ac3Day).filter(Boolean);
  }

  function compactDays(codes){
    const set=new Set(codes||[]);
    if(ALL.every(x=>set.has(x))&&set.size===7)return 'Todos os dias';
    if(['mon','tue','wed','thu','fri'].every(x=>set.has(x))&&!set.has('sat')&&!set.has('sun'))return 'Seg a Sex';
    if(set.size===2&&set.has('sat')&&set.has('sun'))return 'Fim de semana';
    return WEEK.filter(x=>set.has(x[0])).map(x=>x[2]).join(' • ');
  }

  function parseDaysFromText(text){
    const t=String(text||'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase();
    if(!t)return [];
    if(t.includes('todos os dias'))return [...ALL];
    if(/seg\s*(a|-)\s*sex/.test(t))return ['mon','tue','wed','thu','fri'];
    if(t.includes('fim de semana'))return ['sat','sun'];
    const found=[];
    const pats={mon:/(^|\W)(seg|segunda)(\W|$)/,tue:/(^|\W)(ter|terca)(\W|$)/,wed:/(^|\W)(qua|quarta)(\W|$)/,thu:/(^|\W)(qui|quinta)(\W|$)/,fri:/(^|\W)(sex|sexta)(\W|$)/,sat:/(^|\W)(sab|sabado)(\W|$)/,sun:/(^|\W)(dom|domingo)(\W|$)/};
    for(const code of ALL)if(pats[code].test(t))found.push(code);
    return found;
  }

  function compactAvailabilityText(text){
    const t=String(text||'').trim();
    if(!t)return t;
    const days=parseDaysFromText(t);
    if(!days.length)return t;
    const looksLikeAvailability=/\d{1,2}:\d{2}|todos os dias|seg\s*(a|-)\s*sex|fim de semana|(^|\W)(seg|ter|qua|qui|sex|sab|dom)(\W|$)/i.test(t.normalize('NFD').replace(/[\u0300-\u036f]/g,''));
    return looksLikeAvailability?compactDays(days):t;
  }

  function normalizeSelectedTimes(root=document){
    root.querySelectorAll('[data-schedule-day],[data-pc-day],[data-ac3-day]').forEach(row=>{
      const check=row.querySelector('input[type=checkbox]');if(!check?.checked)return;
      const start=row.querySelector('.schedule-start,.pc-day-start,.ac3-start');
      const end=row.querySelector('.schedule-end,.pc-day-end,.ac3-end');
      if(start)start.value='00:00';if(end)end.value='23:59';
    });
  }

  function styleRows(root=document){
    root.querySelectorAll('[data-schedule-day],[data-pc-day],[data-ac3-day]').forEach(row=>row.classList.toggle('is-selected',!!row.querySelector('input[type=checkbox]')?.checked));
  }

  function simplifySchedule(root=document){
    injectStyles();
    root.querySelectorAll('.schedule-box,.pc-schedule,.ac3-schedule').forEach(group=>{
      if(!group.querySelector('[data-schedule-day],[data-pc-day],[data-ac3-day]'))return;
      group.classList.add('av4-days');
      const field=group.closest('.field');const label=field?.querySelector(':scope > label');
      if(label&&(/hor[aá]rios/i.test(label.textContent)||/disponibilidade/i.test(label.textContent)))label.textContent='Disponibilidade semanal';
      const quick=field?.querySelector('.quick-schedule,.pc-quick,.ac3-quick');
      if(quick){
        quick.classList.add('av4-quick');
        const a=quick.querySelector('#scheduleAll,#pcAll,#ac3All');if(a)a.textContent='Todos os dias';
        const w=quick.querySelector('#scheduleWeek,#pcWeek,#ac3Week');if(w)w.textContent='Seg–Sex';
        const e=quick.querySelector('#scheduleWeekend,#pcWeekend,#ac3Weekend');if(e)e.textContent='Fim de semana';
        if(!quick.dataset.av4Bound){quick.dataset.av4Bound='1';quick.addEventListener('click',()=>setTimeout(()=>{normalizeSelectedTimes(field||root);styleRows(field||root)},0),true)}
      }
      if(field&&!field.querySelector('.av4-help')){
        const help=document.createElement('div');help.className='av4-help';help.textContent='Marque os dias em que você costuma aceitar oportunidades. O horário exato aparece em cada vaga ou é combinado com o contratante.';(quick||label)?.insertAdjacentElement('afterend',help);
      }
      group.querySelectorAll('[data-schedule-day],[data-pc-day],[data-ac3-day]').forEach(row=>{
        row.classList.add('av4-day');
        if(!row.dataset.av4Bound){row.dataset.av4Bound='1';row.querySelector('input[type=checkbox]')?.addEventListener('change',()=>{if(row.querySelector('input[type=checkbox]')?.checked){const a=row.querySelector('.schedule-start,.pc-day-start,.ac3-start'),b=row.querySelector('.schedule-end,.pc-day-end,.ac3-end');if(a)a.value='00:00';if(b)b.value='23:59'}styleRows(group)})}
      });
      styleRows(group);
    });
  }

  function compactProfessionalCards(root=document){
    ['#homePros','#proGrid'].forEach(sel=>{
      root.querySelectorAll(`${sel} .card .tag`).forEach(tag=>{const next=compactAvailabilityText(tag.textContent);if(next&&next!==tag.textContent)tag.textContent=next});
    });
  }

  function wrapProCard(){
    const fn=window.proCard;if(typeof fn!=='function'||fn.__availabilityV4Card)return;
    const wrappedFn=function(p){
      if(p&&Array.isArray(p.tags))p={...p,tags:p.tags.map(compactAvailabilityText)};
      return fn.call(this,p);
    };
    wrappedFn.__availabilityV4Card=true;window.proCard=wrappedFn;
  }

  function wrapSave(name){const fn=window[name];if(typeof fn!=='function'||fn.__availabilityV4)return;const w=function(...args){normalizeSelectedTimes(document);return fn.apply(this,args)};w.__availabilityV4=true;window[name]=w}
  function wrapModal(name){const fn=window[name];if(typeof fn!=='function'||fn.__availabilityV4)return;const w=async function(...args){const out=await fn.apply(this,args);setTimeout(()=>simplifySchedule(document),0);return out};w.__availabilityV4=true;window[name]=w}

  function patch(){
    wrapProCard();simplifySchedule(document);compactProfessionalCards(document);
    ['workerModal','editMyProfile','adminProfessionalEditModal'].forEach(wrapModal);
    ['saveWorker','saveMyProfileV3','saveMyProfile','adminSaveProfessionalV3'].forEach(wrapSave);
    wrapped=true;
  }

  const observer=new MutationObserver(()=>{simplifySchedule(document);compactProfessionalCards(document)});
  observer.observe(document.documentElement,{subtree:true,childList:true,characterData:true});
  patch();let tries=0;const timer=setInterval(()=>{patch();if(++tries>=120)clearInterval(timer)},250);
  window.addEventListener('load',patch,{once:true});
  window.addEventListener('pageshow',()=>setTimeout(patch,0));
  window.IntegraTrampoAvailabilityV4={compactDays,parseDaysFromText,compactAvailabilityText,selectedCodes,refresh:patch,get active(){return wrapped}};
})();
