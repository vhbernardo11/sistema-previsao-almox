// IntegraTrampo · Etapa 9 · chat privado por contratação
// Uma conversa pode começar na proposta direta e continuar no serviço após o aceite.
(function(){
  if(window.IntegraTrampoStage9Chat)return;

  let sb=null;
  let threads=[];
  let currentThread=null;
  let currentMessages=[];
  let currentUser=null;
  let realtimeChannel=null;
  let renderTimer=null;
  let renderBusy=false;
  let openBusy=false;
  let augmentTimer=null;

  const wait=ms=>new Promise(r=>setTimeout(r,ms));
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot',"'":'&#39;'}[c]));
  const tell=m=>typeof window.toast==='function'?window.toast(m):alert(m);
  const fmtDateTime=v=>{if(!v)return '';try{return new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'2-digit',hour:'2-digit',minute:'2-digit'}).format(new Date(v))}catch{return String(v)}};
  const statusLabel=v=>({awaiting_confirmation:'Aguardando confirmação',confirmed:'Serviço confirmado',completed:'Concluído',cancelled:'Cancelado',pending:'Proposta pendente',accepted:'Proposta aceita',declined:'Proposta recusada',disputed:'Em análise'}[v]||v||'Conversa');

  function injectStyles(){
    if(document.getElementById('integratrampoStage9Styles'))return;
    const s=document.createElement('style');s.id='integratrampoStage9Styles';s.textContent=`
      .it-stage9{margin:14px 0;border:1px solid #dfe6ee;border-radius:18px;background:linear-gradient(180deg,#fff,#fbfcfe);padding:14px}.it-stage9__head{display:flex;justify-content:space-between;gap:10px;align-items:center;flex-wrap:wrap}.it-stage9__head h4{margin:0}.it-stage9__badge{font-size:11px;font-weight:900;border-radius:999px;padding:5px 8px;background:#6C5CE7;color:#fff}.it-stage9__list{display:grid;gap:9px;margin-top:11px}.it-stage9__item{display:grid;grid-template-columns:1fr auto;gap:10px;align-items:center;border:1px solid #e4eaf0;border-radius:15px;background:#fff;padding:11px}.it-stage9__item h5{margin:0 0 3px;font-size:14px;color:#0D1B2A}.it-stage9__meta{font-size:12px;color:#687481}.it-stage9__preview{font-size:12px;color:#55616d;margin-top:5px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:680px}.it-stage9__unread{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;border-radius:999px;background:#FF6B35;color:#fff;font-size:11px;font-weight:900;margin-left:5px}.it-stage9__empty{margin-top:10px;border-radius:12px;background:#f5f8fb;padding:11px;color:#687481;font-size:12px}.it-stage9-context-btn{white-space:nowrap}.it-chat-shell{display:flex;flex-direction:column;height:min(68vh,620px);min-height:420px}.it-chat-head{border-bottom:1px solid #e6ebf0;padding-bottom:10px;margin-bottom:10px}.it-chat-head h2{margin:0 0 3px}.it-chat-messages{flex:1;overflow:auto;padding:4px 2px 12px;display:flex;flex-direction:column;gap:8px}.it-chat-msg{max-width:82%;border-radius:15px;padding:9px 11px;background:#f1f4f7;align-self:flex-start;color:#1f2933;white-space:pre-wrap;overflow-wrap:anywhere}.it-chat-msg.is-mine{align-self:flex-end;background:#e9fff6}.it-chat-msg__meta{font-size:10px;color:#7a8591;margin-top:4px;text-align:right}.it-chat-compose{border-top:1px solid #e6ebf0;padding-top:10px}.it-chat-compose textarea{width:100%;min-height:72px;max-height:150px;resize:vertical}.it-chat-compose__row{display:flex;justify-content:space-between;align-items:center;gap:9px;margin-top:8px}.it-chat-tip{font-size:11px;color:#7a8591}.it-chat-live{font-size:11px;font-weight:800;color:#087858}.it-chat-live.is-off{color:#8a5a00}
      @media(max-width:620px){.it-stage9__item{grid-template-columns:1fr}.it-stage9__item .btn{width:100%}.it-chat-shell{height:70vh;min-height:360px}.it-chat-msg{max-width:90%}.it-chat-compose__row{align-items:stretch;flex-direction:column}.it-chat-compose__row .btn{width:100%}}
    `;document.head.appendChild(s);
  }

  async function waitForSupabase(){for(let i=0;i<100&&!window.IntegraTrampoSupabase;i++)await wait(80);sb=window.IntegraTrampoSupabase||null;return sb}
  async function rpc(name,args={}){if(!sb)await waitForSupabase();if(!sb)throw new Error('supabase_unavailable');const {data,error}=await sb.rpc(name,args);if(error)throw error;return data}
  async function getUser(){if(!sb)await waitForSupabase();if(!sb)return null;try{const {data:{user}}=await sb.auth.getUser();currentUser=user||null;return currentUser}catch{currentUser=null;return null}}

  async function refreshThreads(){
    const user=await getUser();
    if(!user){threads=[];return threads}
    try{const data=await rpc('it_my_chat_threads_v1');threads=Array.isArray(data)?data:[];return threads}catch(e){console.warn('[Stage9 threads]',e);threads=[];return threads}
  }

  function threadCard(t){
    const unread=Number(t.unread_count||0);
    const preview=t.last_message_body?esc(t.last_message_body):'Conversa pronta para começar.';
    return `<article class="it-stage9__item"><div><h5>💬 ${esc(t.counterpart_name||'Participante')}${unread?`<span class="it-stage9__unread">${unread>99?'99+':unread}</span>`:''}</h5><div class="it-stage9__meta">${esc(t.title||'Conversa')} · ${esc(statusLabel(t.status))}${t.last_message_at?` · ${esc(fmtDateTime(t.last_message_at))}`:''}</div><div class="it-stage9__preview">${preview}</div></div><button class="btn btn--outline" type="button" onclick="openStage9Thread('${esc(t.thread_id)}')">Abrir conversa</button></article>`;
  }

  function sectionHtml(){
    return `<section class="it-stage9" id="itStage9Chat"><div class="it-stage9__head"><div><h4>💬 Conversas</h4><div class="small muted">Chat privado entre profissional e contratante, vinculado à contratação.</div></div><span class="it-stage9__badge">ETAPA 9</span></div>${threads.length?`<div class="it-stage9__list">${threads.map(threadCard).join('')}</div>`:`<div class="it-stage9__empty">As conversas aparecerão aqui. Abra uma proposta ou serviço e toque em <b>💬 Conversar</b> para começar.</div>`}</section>`;
  }

  async function renderThreads(){
    if(renderBusy)return;renderBusy=true;
    try{
      injectStyles();await refreshThreads();document.getElementById('itStage9Chat')?.remove();
      const flow=document.getElementById('serviceFlow');if(!flow)return;
      const holder=document.createElement('div');holder.innerHTML=sectionHtml();const section=holder.firstElementChild;
      const s8=document.getElementById('itStage8Schedule'),s7=document.getElementById('itStage7DirectHiring'),s6=document.getElementById('itStage6Payments'),match=document.getElementById('itMatchStage1');
      if(s8)s8.insertAdjacentElement('afterend',section);else if(s7)s7.insertAdjacentElement('afterend',section);else if(s6)s6.insertAdjacentElement('afterend',section);else if(match)match.insertAdjacentElement('afterend',section);else flow.prepend(section);
      scheduleAugment(20);
    }finally{renderBusy=false}
  }
  function scheduleRender(delay=140){clearTimeout(renderTimer);renderTimer=setTimeout(()=>renderThreads().catch(e=>console.warn('[Stage9 render]',e)),delay)}

  function addContextButton(actions,type,id){
    if(!actions||!id||actions.querySelector(`.it-stage9-context-btn[data-context-id="${CSS.escape(String(id))}"]`))return;
    const b=document.createElement('button');b.type='button';b.className='btn btn--outline it-stage9-context-btn';b.dataset.contextId=String(id);b.textContent='💬 Conversar';b.onclick=()=>window.openStage9Chat?.(type,id);actions.appendChild(b);
  }

  function augmentContextButtons(){
    try{
      document.querySelectorAll('.it-match-card[data-match-service]').forEach(card=>addContextButton(card.querySelector('.it-match-actions:last-child')||card.querySelector('.it-match-actions'),'service',card.getAttribute('data-match-service')));
      const offers=window.IntegraTrampoStage7DirectHiring?.offers||[];
      document.querySelectorAll('#itStage7DirectHiring .it-stage7__item').forEach((card,i)=>addContextButton(card.querySelector('.it-stage7__actions'),'direct_offer',offers[i]?.id));
      const items=window.IntegraTrampoStage8Schedule?.items||[];
      document.querySelectorAll('#itStage8Schedule .it-stage8__item').forEach((card,i)=>{
        const target=card.lastElementChild||card;let holder=target.querySelector?.('.it-stage9-inline-actions');
        if(!holder){holder=document.createElement('div');holder.className='it-stage9-inline-actions';holder.style.marginTop='7px';target.appendChild(holder)}
        addContextButton(holder,'service',items[i]?.service_id);
      });
    }catch(e){console.warn('[Stage9 buttons]',e)}
  }
  function scheduleAugment(delay=60){clearTimeout(augmentTimer);augmentTimer=setTimeout(augmentContextButtons,delay)}

  function liveLabel(){return realtimeChannel?'<span class="it-chat-live">● ao vivo</span>':'<span class="it-chat-live is-off">atualização manual</span>'}

  function renderOpenChat(){
    if(!currentThread||typeof window.modal!=='function')return;
    const messages=currentMessages.map(m=>{
      const mine=currentUser&&String(m.sender_user_id)===String(currentUser.id);
      const receipt=mine?(m.read_at?' · Lida':' · Enviada'):'';
      return `<div class="it-chat-msg ${mine?'is-mine':''}">${esc(m.body)}<div class="it-chat-msg__meta">${esc(fmtDateTime(m.created_at))}${receipt}</div></div>`;
    }).join('')||'<div class="it-stage9__empty">Nenhuma mensagem ainda. Use este espaço para combinar detalhes do serviço com a outra parte.</div>';
    window.modal(`<div class="it-chat-shell"><div class="it-chat-head"><h2>💬 ${esc(currentThread.counterpart_name||'Conversa')}</h2><div class="muted">${esc(currentThread.title||'Contratação')} · ${esc(statusLabel(currentThread.status))} · ${liveLabel()}</div></div><div class="it-chat-messages" id="itStage9Messages">${messages}</div><div class="it-chat-compose"><textarea id="itStage9MessageInput" maxlength="2000" placeholder="Digite sua mensagem..."></textarea><div class="it-chat-compose__row"><div class="it-chat-tip">Conversa registrada na contratação. Não envie senhas ou códigos de acesso.</div><button class="btn btn--green" id="itStage9SendBtn" type="button" onclick="sendStage9Message()">Enviar</button></div></div></div>`);
    setTimeout(()=>{const box=document.getElementById('itStage9Messages');if(box)box.scrollTop=box.scrollHeight;document.getElementById('itStage9MessageInput')?.focus()},0);
  }

  async function loadMessages(threadId,{rerender=true}={}){
    if(!sb)await waitForSupabase();if(!sb)return [];
    const {data,error}=await sb.from('it_chat_messages').select('id,created_at,thread_id,sender_user_id,body,read_at').eq('thread_id',threadId).order('created_at',{ascending:true}).limit(300);
    if(error)throw error;
    currentMessages=Array.isArray(data)?data:[];
    try{await rpc('it_mark_chat_read_v1',{p_thread_id:threadId})}catch(e){console.warn('[Stage9 read]',e)}
    if(rerender)renderOpenChat();
    scheduleRender(70);
    return currentMessages;
  }

  window.openStage9Chat=async function(contextType,contextId){
    if(openBusy)return;openBusy=true;
    try{
      const user=await getUser();if(!user){tell('Entre na sua conta para abrir a conversa.');setTimeout(()=>window.loginModal?.(),100);return}
      const r=await rpc('it_get_or_create_chat_thread_v1',{p_context_type:contextType,p_context_id:contextId});
      await refreshThreads();
      currentThread=threads.find(t=>String(t.thread_id)===String(r?.thread_id))||{thread_id:r?.thread_id,service_id:r?.service_id,direct_offer_id:r?.direct_offer_id,title:'Conversa da contratação',counterpart_name:'Participante',status:'active'};
      await loadMessages(currentThread.thread_id,{rerender:true});
    }catch(e){console.error('[Stage9 open]',e);const m=String(e?.message||e||'');if(m.includes('chat_not_accessible'))tell('Essa conversa pertence somente às duas partes da contratação.');else if(m.includes('chat_context_not_found'))tell('Não foi possível localizar essa contratação.');else tell('Não foi possível abrir a conversa agora.');}
    finally{openBusy=false}
  };

  window.openStage9Thread=async function(threadId){
    if(openBusy)return;openBusy=true;
    try{
      const user=await getUser();if(!user){tell('Entre na sua conta para abrir a conversa.');return}
      if(!threads.length)await refreshThreads();
      currentThread=threads.find(t=>String(t.thread_id)===String(threadId));
      if(!currentThread){tell('Conversa não encontrada.');return}
      await loadMessages(threadId,{rerender:true});
    }catch(e){console.error('[Stage9 thread]',e);tell('Não foi possível carregar essa conversa agora.')}finally{openBusy=false}
  };

  window.sendStage9Message=async function(){
    const input=document.getElementById('itStage9MessageInput'),btn=document.getElementById('itStage9SendBtn');
    const body=input?.value.trim()||'';
    if(!currentThread||!currentUser)return tell('Abra uma conversa antes de enviar.');
    if(!body)return tell('Digite uma mensagem.');
    if(body.length>2000)return tell('A mensagem pode ter no máximo 2.000 caracteres.');
    if(btn){btn.disabled=true;btn.textContent='Enviando...'}
    try{
      const {error}=await sb.from('it_chat_messages').insert({thread_id:currentThread.thread_id,sender_user_id:currentUser.id,body});if(error)throw error;
      if(input)input.value='';
      await loadMessages(currentThread.thread_id,{rerender:true});
    }catch(e){console.error('[Stage9 send]',e);tell('Não foi possível enviar a mensagem agora.');if(btn){btn.disabled=false;btn.textContent='Enviar'}}
  };

  async function setupRealtime(){
    if(!sb)await waitForSupabase();if(!sb)return;
    if(realtimeChannel){try{await sb.removeChannel(realtimeChannel)}catch{};realtimeChannel=null}
    const user=await getUser();if(!user)return;
    try{
      realtimeChannel=sb.channel(`integratrampo-chat-${user.id}`)
        .on('postgres_changes',{event:'*',schema:'public',table:'it_chat_messages'},payload=>{
          const row=payload?.new&&Object.keys(payload.new).length?payload.new:payload?.old||{};
          scheduleRender(60);
          if(currentThread&&String(row.thread_id||'')===String(currentThread.thread_id))loadMessages(currentThread.thread_id,{rerender:true}).catch(e=>console.warn('[Stage9 realtime refresh]',e));
        })
        .subscribe(status=>{if(status==='CHANNEL_ERROR'||status==='TIMED_OUT'||status==='CLOSED'){realtimeChannel=null;if(currentThread)renderOpenChat()}});
    }catch(e){console.warn('[Stage9 realtime]',e);realtimeChannel=null}
  }

  function installHooks(){scheduleAugment(20)}
  const previousRenderPanel=window.renderPanel;
  if(typeof previousRenderPanel==='function')window.renderPanel=async function(...args){const r=await previousRenderPanel.apply(this,args);installHooks();scheduleRender(260);return r};
  const previousUserPanelTab=window.userPanelTab;
  if(typeof previousUserPanelTab==='function')window.userPanelTab=function(...args){const r=previousUserPanelTab.apply(this,args);installHooks();scheduleRender(170);return r};

  async function init(){
    injectStyles();await waitForSupabase();if(!sb)return;
    await setupRealtime();scheduleRender(340);scheduleAugment(500);
    try{sb.auth.onAuthStateChange(()=>{setTimeout(()=>{setupRealtime().catch(()=>{});scheduleRender(150);scheduleAugment(300)},50)})}catch{}
    try{const obs=new MutationObserver(()=>scheduleAugment(80));obs.observe(document.body,{childList:true,subtree:true})}catch{}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
  window.IntegraTrampoStage9Chat={version:1,get threads(){return threads},get currentThread(){return currentThread},refresh:renderThreads,open:window.openStage9Chat};
})();