// IntegraTrampo · acesso administrativo separado
// O segredo nunca fica no frontend: login e senha são validados no Supabase
// e o navegador recebe apenas um token temporário de sessão (8h).
(function(){
  const SESSION_KEY='integratrampo_admin_session_v1';
  let sb=null;
  let adminToken=null;
  let isAdmin=false;
  let adminName='Administrador';
  let initialized=false;

  const $id=id=>document.getElementById(id);
  const wait=ms=>new Promise(r=>setTimeout(r,ms));

  function getStoredToken(){
    try{return sessionStorage.getItem(SESSION_KEY)||null}catch{return null}
  }

  function storeToken(token){
    try{
      if(token)sessionStorage.setItem(SESSION_KEY,token);
      else sessionStorage.removeItem(SESSION_KEY);
    }catch{}
  }

  function setAdminState(ok,token=null,name='Administrador'){
    isAdmin=!!ok;
    adminToken=ok?token:null;
    adminName=name||'Administrador';
    if(ok&&token)storeToken(token); else if(!ok)storeToken(null);
    updateAdminUi();
  }

  function updateAdminUi(){
    const top=document.querySelector('.top-actions');
    let btn=$id('adminAccessBtn');
    if(top&&!btn){
      btn=document.createElement('button');
      btn.id='adminAccessBtn';
      btn.className='icon-btn';
      btn.type='button';
      top.insertBefore(btn,top.firstChild);
    }
    if(btn){
      btn.textContent=isAdmin?'🛡️ ADM':'🔐 ADM';
      btn.title=isAdmin?'Abrir área administrativa':'Entrar como administrador';
      btn.onclick=()=>isAdmin?openAdminArea():adminLoginModal();
    }

    document.querySelectorAll('[data-go="operacao"]').forEach(el=>{
      el.setAttribute('title',isAdmin?'Área administrativa':'Área restrita · login ADM');
      el.dataset.adminProtected='1';
    });

    let bar=$id('adminSessionBar');
    const screen=$id('screen-operacao');
    if(screen){
      if(isAdmin&&!bar){
        bar=document.createElement('div');
        bar.id='adminSessionBar';
        bar.className='system-note';
        bar.style.marginBottom='16px';
        bar.innerHTML=`🛡️ <b>Modo administrador ativo</b> · <span id="adminSessionName"></span> <button class="text-btn" id="adminLogoutInline" style="margin-left:10px">Sair do ADM</button>`;
        screen.insertBefore(bar,screen.firstChild);
        const out=$id('adminLogoutInline');
        if(out)out.onclick=()=>adminLogout();
      }
      if(!isAdmin&&bar)bar.remove();
      const name=$id('adminSessionName');if(name)name.textContent=adminName;
    }
  }

  async function validateToken(token){
    if(!sb||!token)return false;
    try{
      const {data,error}=await sb.rpc('it_admin_session_valid',{p_token:token});
      if(error){console.warn('admin validate',error);return false}
      return data===true;
    }catch(e){console.warn('admin validate',e);return false}
  }

  window.adminLoginModal=function(){
    if(isAdmin){openAdminArea();return}
    if(typeof modal!=='function')return;
    modal(`<div class="notice">🛡️ <b>Área administrativa IntegraTrampo.</b> Acesso separado dos usuários comuns.</div>
      <h2>Login ADM</h2>
      <p class="muted">Digite o login e a senha de administrador.</p>
      <div class="form-grid">
        <div class="field full"><label>Login</label><input id="admLogin" autocomplete="username" placeholder="admin"></div>
        <div class="field full"><label>Senha</label><input id="admPassword" type="password" autocomplete="current-password" placeholder="••••••••••••"></div>
      </div>
      <div class="modal-actions">
        <button class="btn btn--navy" id="admSubmitBtn">Entrar como ADM</button>
        <button class="btn btn--outline" onclick="closeModal()">Cancelar</button>
      </div>
      <div id="admFeedback" class="small muted" style="margin-top:12px"></div>`);

    const login=$id('admLogin'),pass=$id('admPassword'),btn=$id('admSubmitBtn');
    if(login)login.focus();
    const submit=()=>adminSubmit();
    if(btn)btn.onclick=submit;
    [login,pass].forEach(el=>el&&el.addEventListener('keydown',e=>{if(e.key==='Enter')submit()}));
  };

  window.adminSubmit=async function(){
    const login=$id('admLogin')?.value?.trim()||'';
    const password=$id('admPassword')?.value||'';
    const btn=$id('admSubmitBtn');
    const feedback=$id('admFeedback');
    if(!login||!password){if(feedback)feedback.textContent='Informe login e senha.';return}
    if(!sb){if(feedback)feedback.textContent='Conexão ainda não disponível. Tente novamente em alguns segundos.';return}

    if(btn){btn.disabled=true;btn.textContent='Validando...'}
    try{
      const {data,error}=await sb.rpc('it_admin_login',{p_login:login,p_password:password});
      if(error)throw error;
      const row=Array.isArray(data)?data[0]:data;
      if(!row?.token){
        if(feedback)feedback.textContent='Login ou senha inválidos.';
        if(btn){btn.disabled=false;btn.textContent='Entrar como ADM'}
        return;
      }
      setAdminState(true,row.token,row.display_name||'Administrador');
      if(typeof closeModal==='function')closeModal();
      if(typeof toast==='function')toast('Acesso administrativo liberado');
      openAdminArea();
    }catch(e){
      console.error('admin login',e);
      if(feedback)feedback.textContent='Não foi possível validar o acesso agora.';
      if(btn){btn.disabled=false;btn.textContent='Entrar como ADM'}
    }
  };

  window.openAdminArea=function(){
    if(!isAdmin){adminLoginModal();return}
    if(typeof go==='function')go('operacao');
    updateAdminUi();
  };

  window.adminLogout=async function(){
    const token=adminToken;
    setAdminState(false);
    try{if(sb&&token)await sb.rpc('it_admin_logout',{p_token:token})}catch(e){console.warn('admin logout',e)}
    if(typeof toast==='function')toast('Sessão ADM encerrada');
    if($id('screen-operacao')?.classList.contains('is-active')&&typeof go==='function')go('home');
  };

  // Impede a navegação normal para a tela Operação sem sessão administrativa.
  document.addEventListener('click',e=>{
    const target=e.target.closest?.('[data-go="operacao"]');
    if(target&&!isAdmin){
      e.preventDefault();
      e.stopPropagation();
      e.stopImmediatePropagation();
      adminLoginModal();
    }
  },true);

  async function init(){
    if(initialized)return;initialized=true;
    for(let i=0;i<80&&!window.IntegraTrampoSupabase;i++)await wait(100);
    sb=window.IntegraTrampoSupabase||null;
    if(!sb){console.warn('Admin: Supabase não inicializado');updateAdminUi();return}
    const token=getStoredToken();
    if(token&&await validateToken(token))setAdminState(true,token,'Administrador IntegraTrampo');
    else setAdminState(false);
    updateAdminUi();
  }

  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});
  else init();
})();
