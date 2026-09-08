// IntegraTrampo · disponibilidade semanal v4
// Simplifica a agenda profissional para dias da semana, sem expor horários repetitivos no cadastro/cartão.
(function(){
  const WEEK=[
    ['mon','Segunda','Seg'],['tue','Terça','Ter'],['wed','Quarta','Qua'],['thu','Quinta','Qui'],
    ['fri','Sexta','Sex'],['sat','Sábado','Sáb'],['sun','Domingo','Dom']
  ];
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
    const rows=[...root.querySelectorAll('[data-schedule-day],[data-pc-day],[data-ac3-day]')];
    return rows.filter(row=>row.querySelector('input[type=checkbox]')?.checked).map(row=>row.dataset.scheduleDay||row.dataset.pcDay||row.dataset.ac3Day).filter(Boolean);
  }

  function compactDays(codes){
    const set=new Set(codes);
    if(ALL.every(x=>set.has(x))&&set.size===7)return 'Todos os dias';
    if(['mon','tue','wed','thu','fri'].every(x=>set.has(x))&&!set.has('sat')&&!set.has('sun'))return 'Seg a Sex';
    if(set.size===2&&set.has('sat')&&set.has('sun'))return 'Fim de semana';
    return WEEK.filter(x=>set.has(x[0])).map(x=>x[2]).join(' • ');
  }

  function normalizeSelectedTimes(root=document){
    root.querySelectorAll('[data-schedule-day],[data-pc-day],[data-ac3-day]').forEach(row=>{
      const check=row.querySelector('input[type=checkbox]');
      if(!check?.checked)return;
      const start=row.querySelector('.schedule-start,.pc-day-start,.ac3-start');
      const end=row.querySelector('.schedule-end,.pc-day-end,.ac3-end');
      if(start)start.value='00:00';
      if(end)end.value='23:59';
    });
  }

  function simplifySchedule(root=document){
    injectStyles();
    const groups=root.querySelectorAll('.schedule-box,.pc-schedule,.ac3-schedule');
    groups.forEach(group=>{
      if(!group.querySelector('[data-schedule-day],[data-pc-day],[data-ac3-day]'))return;
      group.classList.add('av4-days');
      const field=group.closest('.field');
      const label=field?.querySelector(':scope > label');
      if(label&&(/hor[aá]rios/i.test(label.textContent)||/disponibilidade/i.test(label.textContent)))label.textContent='Disponibilidade semanal';
      const quick=field?.querySelector('.quick-schedule,.pc-quick,.ac3-quick');
      if(quick){
        quick.classList.add('av4-quick');
        const allBtn=quick.querySelector('#scheduleAll,#pcAll,#ac3All');if(allBtn)allBtn.textContent='Todos os dias';
        const weekBtn=quick.querySelector('#scheduleWeek,#pcWeek,#ac3Week');if(weekBtn)weekBtn.textContent='Seg–Sex';
        const weekendBtn=quick.querySelector('#scheduleWeekend,#pcWeekend,#ac3Weekend');if(weekendBtn)weekendBtn.textContent='Fim de semana';
        if(!quick.dataset.av4Bound){
          quick.dataset.av4Bound='1';
          quick.addEventListener('click',()=>setTimeout(()=>{normalizeSelectedTimes(field||root);styleRows(field||root)},0),true);
        }
      }
      if(field&&!field.querySelector('.av4-help')){
        const help=document.createElement('div');
        help.className='av4-help';
        help.textContent='Marque os dias em que você costuma aceitar oportunidades. O horário exato será informado em cada vaga ou combinado com o contratante.';
        (quick||label)?.insertAdjacentElement('afterend',help);
      }
      group.querySelectorAll('[data-schedule-day],[data-pc-day],[data-ac3-day]').forEach(row=>{
        row.classList.add('av4-day');
        if(!row.dataset.av4Bound){
          row.dataset.av4Bound='1';
          row.querySelector('input[type=checkbox]')?.addEventListener('change',()=>{
            if(row.querySelector('input[type=checkbox]')?.checked){
              const start=row.querySelector('.schedule-start,.pc-day-start,.ac3-start');
              const end=row.querySelector('.schedule-end,.pc-day-end,.ac3-end');
              if(start)start.value='00:00';if(end)end.value='23:59';
            }
            styleRows(group);
          });
        }
      });
      styleRows(group);
    });
  }

  function styleRows(root=document){
    root.querySelectorAll('[data-schedule-day],[data-pc-day],[data-ac3-day]').forEach(row=>row.classList.toggle('is-selected',!!row.querySelector('input[type=checkbox]')?.checked));
  }

  function parseDaysFromText(text){
    const t=String(text||'');
    if(!t)return [];
    if(/todos os dias/i.test(t))return [...ALL];
    if(/seg\s*a\s*sex/i.test(t))return ['mon','tue','wed','thu','fri'];
    if(/fim de semana/i.test(t))return ['sat','sun'];
    const found=[];
    const patterns={
      mon:/\b(seg|segunda)\b/i,tue:/\b(ter|terça|terca)\b/i,wed:/\b(qua|quarta)\b/i,thu:/\b(qui|quinta)\b/i,
      fri:/\b(sex|sexta)\b/i,sat:/\b(sáb|sab|sábado|sabado)\b/i,sun:/\b(dom|domingo)\b/i
    };
    for(const code of ALL)if(patterns[code].test(t))found.push(code);
    return found;
  }

  function compactVisibleTags(root=document){
    root.querySelectorAll('.tag').forEach(tag=>{
      const text=tag.textContent||'';
      if(!/\d{1,2}:\d{2}/.test(text)&&!/todos os dias|seg\s*a\s*sex|fim de semana/i.test(text))return;
      const days=parseDaysFromText(text);
      if(days.length)tag.textContent=compactDays(days);
    });
  }

  function wrapSave(name){
    const fn=window[name];
    if(typeof fn!=='function'||fn.__availabilityV4)return;
    const wrappedFn=function(...args){normalizeSelectedTimes(document);return fn.apply(this,args)};
    wrappedFn.__availabilityV4=true;
    window[name]=wrappedFn;
  }

  function wrapModal(name){
    const fn=window[name];
    if(typeof fn!=='function'||fn.__availabilityV4)return;
    const wrappedFn=async function(...args){
      const out=await fn.apply(this,args);
      setTimeout(()=>simplifySchedule(document),0);
      return out;
    };
    wrappedFn.__availabilityV4=true;
    window[name]=wrappedFn;
  }

  function patch(){
    simplifySchedule(document);
    compactVisibleTags(document);
    ['workerModal','editMyProfile','adminProfessionalEditModal'].forEach(wrapModal);
    ['saveWorker','saveMyProfileV3','saveMyProfile','adminSaveProfessionalV3'].forEach(wrapSave);
    wrapped=true;
  }

  const observer=new MutationObserver(()=>{simplifySchedule(document);compactVisibleTags(document)});
  observer.observe(document.documentElement,{subtree:true,childList:true});
  patch();
  let tries=0;const timer=setInterval(()=>{patch();if(++tries>=60)clearInterval(timer)},500);
  window.addEventListener('load',patch,{once:true});
  window.IntegraTrampoAvailabilityV4={compactDays,parseDaysFromText,selectedCodes,refresh:patch,get active(){return wrapped}};
})();