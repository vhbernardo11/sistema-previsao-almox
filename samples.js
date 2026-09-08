const samplePros=[
{id:'sample-p1',name:'Rafael Martins',role:'Garçom • Barman',rating:4.9,reviews:12,rate:150,match:96,tags:['Noite','Fim de semana','Transporte'],img:'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&w=800&q=85',city:'Teodoro Sampaio - SP'},
{id:'sample-p2',name:'Juliana Costa',role:'Auxiliar de cozinha',rating:4.8,reviews:9,rate:130,match:91,tags:['Tarde','Noite','Experiência'],img:'https://images.unsplash.com/photo-1494790108377-be9c29b29330?auto=format&fit=crop&w=800&q=85',city:'Teodoro Sampaio - SP'},
{id:'sample-p3',name:'Carlos Silva',role:'Churrasqueiro • Serviços gerais',rating:4.7,reviews:15,rate:180,match:88,tags:['Fim de semana','Transporte'],img:'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&w=800&q=85',city:'Teodoro Sampaio - SP'},
{id:'sample-p4',name:'Ana Paula',role:'Recepção • Eventos',rating:4.9,reviews:20,rate:140,match:94,tags:['Manhã','Tarde','Eventos'],img:'https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&w=800&q=85',city:'Teodoro Sampaio - SP'}
];
const sampleJobs=[
{id:'sample-o1',title:'2 garçons para evento',company:'Espaço Aurora Eventos',cat:'Garçom',date:'Sáb, 12/09',time:'18h às 01h',rate:160,v:2,match:96,img:'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=1000&q=85'},
{id:'sample-o2',title:'Auxiliar de cozinha',company:'Sabor da Terra',cat:'Cozinha',date:'Sex, 11/09',time:'16h às 00h',rate:140,v:1,match:90,img:'https://images.unsplash.com/photo-1556910103-1c02745aae4d?auto=format&fit=crop&w=1000&q=85'},
{id:'sample-o3',title:'Equipe de limpeza para evento',company:'Recanto do Lago',cat:'Limpeza',date:'Dom, 13/09',time:'08h às 17h',rate:130,v:4,match:87,img:'https://images.unsplash.com/photo-1581578731548-c64695cc6952?auto=format&fit=crop&w=1000&q=85'}
];
const sampleCompanies=[
{id:'sample-c1',name:'Espaço Aurora Eventos',kind:'Eventos',rating:4.8,jobs:14,img:'https://images.unsplash.com/photo-1519167758481-83f550bb49b3?auto=format&fit=crop&w=600&q=80',city:'Teodoro Sampaio - SP'},
{id:'sample-c2',name:'Sabor da Terra',kind:'Restaurante',rating:4.7,jobs:19,img:'https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?auto=format&fit=crop&w=600&q=80',city:'Teodoro Sampaio - SP'},
{id:'sample-c3',name:'Recanto do Lago',kind:'Eventos',rating:4.9,jobs:9,img:'https://images.unsplash.com/photo-1566073771259-6a8506099945?auto=format&fit=crop&w=600&q=80',city:'Teodoro Sampaio - SP'},
{id:'sample-c4',name:'Ponto da Brasa',kind:'Gastronomia',rating:4.8,jobs:17,img:'https://images.unsplash.com/photo-1550547660-d9450f859349?auto=format&fit=crop&w=600&q=80',city:'Teodoro Sampaio - SP'}
];
const sampleState=JSON.parse(localStorage.getItem('it_samples')||'{"interests":[]}');
const saveSamples=()=>localStorage.setItem('it_samples',JSON.stringify(sampleState));

const realOpenPro=openPro, realOpenCompany=openCompany, realOpenJob=openJob;

function sampleProCard(p){return `<article class="card"><div class="card__media"><img src="${p.img}" alt="Foto ilustrativa de ${p.name}"><span class="badge badge--blue" style="position:absolute;left:12px;top:12px">DEMONSTRAÇÃO · PERFIL FICTÍCIO</span></div><div class="card__body"><h3>${p.name}</h3><div class="muted small">${p.role}</div><div class="rating">⭐ ${p.rating} <span class="muted">(${p.reviews})</span></div><div class="tags">${p.tags.map(t=>`<span class="tag">${t}</span>`).join('')}</div><div class="money">R$ ${p.rate}/dia</div><div class="matchline"><span class="small muted">${p.match}% compatibilidade</span><div class="matchbar"><span style="width:${p.match}%"></span></div></div><div class="card-actions"><button class="btn btn--outline" onclick="openPro('${p.id}')">Ver perfil demonstrativo</button></div></div></article>`}
function sampleJobCard(o){const interested=sampleState.interests.includes(o.id);return `<article class="card"><div class="card__media"><img src="${o.img}" alt="Imagem ilustrativa da oportunidade"><span class="badge badge--orange" style="position:absolute;left:12px;top:12px">DEMONSTRAÇÃO · VAGA FICTÍCIA</span></div><div class="card__body"><div class="muted small">${o.company}</div><h3>${o.title}</h3><div class="meta"><span>📅 ${o.date}</span><span>⏰ ${o.time}</span><span>💚 ${o.match}% compatibilidade</span></div><div class="money">R$ ${o.rate}/dia</div><div class="card-actions"><button class="btn btn--green" onclick="openJob('${o.id}')">${interested?'Interesse simulado':'Ver vaga demonstrativa'}</button></div></div></article>`}
function sampleCompanyCard(c){return `<article class="card company-card"><div class="company-head"><img class="company-photo" src="${c.img}" alt="Imagem ilustrativa de ${c.name}"><div><span class="badge badge--blue">DEMONSTRAÇÃO · EMPRESA FICTÍCIA</span><h3>${c.name}</h3><div class="muted small">${c.kind}</div></div></div><div class="meta"><span>⭐ ${c.rating}</span><span>${c.jobs} contratações ilustrativas</span></div><button class="btn btn--outline" style="width:100%" onclick="openCompany('${c.id}')">Ver empresa demonstrativa</button></article>`}

openPro=function(id){
  if(!id.startsWith('sample-')) return realOpenPro(id);
  const p=samplePros.find(x=>x.id===id); if(!p)return;
  modal(`<div class="notice">🧪 <b>Perfil de demonstração.</b> Nome, avaliações, valor e histórico são fictícios. A foto é apenas ilustrativa.</div><h2>${p.name}</h2><p class="muted">${p.role} · ${p.city}</p><div class="kpi-grid"><div class="kpi"><strong>${p.rating}</strong><span>Nota ilustrativa</span></div><div class="kpi"><strong>${p.reviews}</strong><span>Avaliações ilustrativas</span></div><div class="kpi"><strong>R$ ${p.rate}</strong><span>Diária ilustrativa</span></div><div class="kpi"><strong>${p.match}%</strong><span>Compatibilidade</span></div></div><div class="modal-actions"><button class="btn btn--green" onclick="toast('Ação apenas demonstrativa')">Simular interesse</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`)
};
openCompany=function(id){
  if(!id.startsWith('sample-')) return realOpenCompany(id);
  const c=sampleCompanies.find(x=>x.id===id); if(!c)return;
  modal(`<div class="notice">🧪 <b>Empresa de demonstração.</b> Nome, avaliações e contratações são fictícios; a imagem é ilustrativa.</div><h2>${c.name}</h2><p class="muted">${c.kind} · ${c.city}</p><div class="kpi-grid"><div class="kpi"><strong>${c.rating}</strong><span>Reputação ilustrativa</span></div><div class="kpi"><strong>${c.jobs}</strong><span>Contratações ilustrativas</span></div><div class="kpi"><strong>Local</strong><span>Atuação</span></div><div class="kpi"><strong>🧪</strong><span>Demonstração</span></div></div><button class="btn btn--outline" onclick="closeModal()">Fechar</button>`)
};
openJob=function(id){
  if(!id.startsWith('sample-')) return realOpenJob(id);
  const o=sampleJobs.find(x=>x.id===id); if(!o)return;
  const interested=sampleState.interests.includes(id);
  modal(`<div class="notice">🧪 <b>Oportunidade de demonstração.</b> Nenhuma candidatura real será enviada e esta vaga não entra nas métricas da plataforma.</div><h2>${o.title}</h2><p class="muted">${o.company} · ${o.cat}</p><div class="meta"><span>📅 ${o.date}</span><span>⏰ ${o.time}</span><span>👥 ${o.v} vaga(s)</span></div><div class="money">R$ ${o.rate}/dia</div><div class="modal-actions"><button class="btn btn--green" ${interested?'disabled':''} onclick="sampleInterest('${id}')">${interested?'✅ Interesse simulado':'Simular candidatura'}</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`)
};
function sampleInterest(id){if(!sampleState.interests.includes(id))sampleState.interests.push(id);saveSamples();closeModal();renderHome();renderJobs();toast('Candidatura simulada — nenhum dado real foi enviado')}

renderHome=function(){
  const pros=[...publicPros.slice(0,4).map(proCard),...samplePros.slice(0,Math.max(0,4-publicPros.length)).map(sampleProCard)];
  const jobs=[...publicJobs.slice(0,3).map(jobCard),...sampleJobs.slice(0,Math.max(0,3-publicJobs.length)).map(sampleJobCard)];
  const companies=[...publicCompanies.slice(0,4).map(companyCard),...sampleCompanies.slice(0,Math.max(0,4-publicCompanies.length)).map(sampleCompanyCard)];
  $('homePros').innerHTML=pros.join('');$('homeJobs').innerHTML=jobs.join('');$('homeCompanies').innerHTML=companies.join('');
};
renderPros=function(){
  const q=($('proQuery')?.value||'').toLowerCase(),cat=$('proCategory')?.value||'',ord=$('proOrder')?.value||'match';
  let real=publicPros.filter(p=>(!q||`${p.name} ${p.role} ${(p.tags||[]).join(' ')}`.toLowerCase().includes(q))&&(!cat||p.role.includes(cat)));
  let samples=samplePros.filter(p=>(!q||`${p.name} ${p.role} ${p.tags.join(' ')}`.toLowerCase().includes(q))&&(!cat||p.role.includes(cat)));
  const sorter=ord==='rating'?((a,b)=>(b.rating||0)-(a.rating||0)):ord==='rate'?((a,b)=>(a.rate||9999)-(b.rate||9999)):((a,b)=>(b.match||0)-(a.match||0));
  real.sort(sorter);samples.sort(sorter);
  const html=[...real.map(proCard),...samples.map(sampleProCard)].join('');
  $('proGrid').innerHTML=html||emptyState('Nenhum profissional encontrado com esses filtros.');
};
renderJobs=function(){
  const q=($('jobQuery')?.value||'').toLowerCase(),cat=$('jobCategory')?.value||'',ord=$('jobOrder')?.value||'match';
  let real=publicJobs.filter(o=>(!q||`${o.title} ${o.company} ${o.cat}`.toLowerCase().includes(q))&&(!cat||o.cat===cat));
  let samples=sampleJobs.filter(o=>(!q||`${o.title} ${o.company} ${o.cat}`.toLowerCase().includes(q))&&(!cat||o.cat===cat));
  const sorter=ord==='rate'?((a,b)=>(b.rate||0)-(a.rate||0)):((a,b)=>(b.match||0)-(a.match||0));
  real.sort(sorter);samples.sort(sorter);
  const html=[...real.map(jobCard),...samples.map(sampleJobCard)].join('');
  $('jobGrid').innerHTML=html||emptyState('Nenhuma oportunidade encontrada com esses filtros.');
};
renderCompanies=function(){const html=[...publicCompanies.map(companyCard),...sampleCompanies.map(sampleCompanyCard)].join('');$('companyGrid').innerHTML=html||emptyState('Nenhum contratante encontrado.');};
filterCategory=function(cat){go('vagas');const all=[...publicJobs,...sampleJobs];$('jobCategory').value=all.some(x=>x.cat===cat)?cat:'';renderJobs()};
populateFilters=function(){
  const jobs=[...publicJobs,...sampleJobs],pros=[...publicPros,...samplePros];
  const jc=[...new Set(jobs.map(x=>x.cat))],pc=[...new Set(pros.map(x=>x.role.split(' • ')[0]))];
  $('jobCategory').innerHTML='<option value="">Todas as categorias</option>'+jc.map(x=>`<option>${x}</option>`).join('');
  $('proCategory').innerHTML='<option value="">Todas as áreas</option>'+pc.map(x=>`<option>${x}</option>`).join('');
};

// Reassocia os filtros depois que as funções de demonstração substituem
// as renderizações base. Assim os dados reais e os exemplos continuam
// aparecendo juntos também após busca, ordenação e limpeza dos filtros.
if($('jobQuery')) $('jobQuery').oninput=()=>renderJobs();
if($('jobCategory')) $('jobCategory').onchange=()=>renderJobs();
if($('jobOrder')) $('jobOrder').onchange=()=>renderJobs();
if($('clearJobs')) $('clearJobs').onclick=()=>{$('jobQuery').value='';$('jobCategory').value='';$('jobOrder').value='match';renderJobs()};
if($('proQuery')) $('proQuery').oninput=()=>renderPros();
if($('proCategory')) $('proCategory').onchange=()=>renderPros();
if($('proOrder')) $('proOrder').onchange=()=>renderPros();
if($('clearPros')) $('clearPros').onclick=()=>{$('proQuery').value='';$('proCategory').value='';$('proOrder').value='match';renderPros()};

// Expansão de categorias: segurança subdividida e serviços residenciais.
const extraServiceCategories=[
  ['🛡️','Segurança de eventos'],
  ['🚪','Controlador de acesso'],
  ['👁️','Vigia'],
  ['🛡️','Vigilante'],
  ['🎨','Pintor residencial'],
  ['🚰','Encanador'],
  ['⚡','Eletricista']
];
const genericSecurityIndex=categories.findIndex(([,name])=>name==='Segurança');
if(genericSecurityIndex>=0) categories.splice(genericSecurityIndex,1);
extraServiceCategories.forEach(([icon,name])=>{
  if(!categories.some(([,existing])=>existing===name)) categories.splice(Math.max(0,categories.length-1),0,[icon,name]);
});

const extraWorkerRoles=extraServiceCategories.map(([,name])=>name);
const originalWorkerModal=workerModal;
workerModal=function(){
  originalWorkerModal();
  const select=$('wRole');
  if(select){
    extraWorkerRoles.forEach(name=>{
      if(![...select.options].some(o=>o.value===name||o.text===name)) select.add(new Option(name,name));
    });
  }
};

const originalHiringModal=hiringModal;
hiringModal=function(){
  originalHiringModal();
  const select=$('hCat');
  if(select){
    extraWorkerRoles.forEach(name=>{
      if(![...select.options].some(o=>o.value===name||o.text===name)) select.add(new Option(name,name));
    });
  }
};

if($('workerBtn')) $('workerBtn').onclick=workerModal;
if($('hireBtn')) $('hireBtn').onclick=hiringModal;
if($('hireBtn2')) $('hireBtn2').onclick=hiringModal;

renderAll();
