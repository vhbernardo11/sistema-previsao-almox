// IntegraTrampo · autenticação simples v6
// Login próprio: e-mail ou telefone + senha. Sem Google, Facebook ou Apple.
(function(){
  let sb=null;
  let accountCache=null;
  let initialized=false;
  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof toast==='function'?toast(m):alert(m);
  const isEmail=v=>/^\S+@\S+\.\S+$/.test(String(v||'').trim());
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function injectStyles(){
    if($id('itAuthSimpleV6Styles'))return;
    const s=document.createElement('style');
    s.id='itAuthSimpleV6Styles';
    s.textContent=`
      .auth6-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;background:#f1f5f9;padding:5px;border-radius:14px;margin:10px 0 15px}
      .auth6-tabs button{border:0;background:transparent;border-radius:10px;padding:11px 8px;font-weight:850;color:#64748b;cursor:pointer}
      .auth6-tabs button.is-active{background:#fff;color:#0D1B2A;box-shadow:0 2px 10px rgba(13,27,42,.08)}
      .auth6-methods{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:8px 0 12px}
      .auth6-method{border:1px solid #dbe4ee;background:#fff;border-radius:13px;padding:12px 10px;font-weight:850;cursor:pointer;color:#0D1B2A}
      .auth6-method.is-active{border-color:#16B898;background:#ecfdf8;box-shadow:0 0 0 1px #16B898 inset}
      .auth6-password-wrap{position:relative}.auth6-password-wrap input{padding-right:78px}
      .auth6-show{position:absolute;right:10px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#1976D2;font-weight:850;cursor:pointer;font-size:12px}
      .auth6-help{font-size:12px;color:#64748b;line-height:1.5;margin-top:7px}
      .auth6-links{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px}
      .auth6-link{border:0;background:transparent;color:#1976D2;font-weight:850;padding:0;cursor:pointer}
      .auth6-status{padding:10px 12px;border-radius:11px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#475569;margin-top:10px}
      @media(max-width:430px){.auth6-links{flex-direction:column;align-items:flex-start}}
    `;
    document.head.appendChild(s);
  }

  function normalizePhone(value){
    let d=String(value||'').replace(/\D/g,'');
    if(!d)return '';
    if(d.startsWith('00'))d=d.slice(2);
    if(d.startsWith('55')&&(d.length===12||d.length===13))return '+'+d;
    if(d.length===10||d.length===11)return '+55'+d;
    return '+'+d;
  }

  function loginRedirect(){return `${window.location.origin}${window.location.pathname}`}

  async function waitForSb(){
    for(let i=0;i<120&&!window.IntegraTrampoSupabase;i++)await sleep(50);
    sb=window.IntegraTrampoSupabase||null;
    return sb;
  }

  async function syncAccountData(){
    if(!sb)return null;
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user){accountCache=null;window.IntegraTrampoAuthAccount=null;return null}
      try{
        const {data,error}=await sb.rpc('it_sync_my_auth_data_v4');
        if(!error&&data?.account)accountCache=data.account;
      }catch{}
      if(!accountCache){
        accountCache={
          email:user.email||null,
          phone:user.phone||null,
          full_name:user.user_metadata?.full_name||user.user_metadata?.name||null,
          avatar_url:user.user_metadata?.avatar_url||user.user_metadata?.picture||null,
          provider:user.app_metadata?.provider||'password'
        };
      }
      window.IntegraTrampoAuthAccount=accountCache;
      return accountCache;
    }catch(e){console.warn('auth sync',e);return accountCache}
  }

  function friendlyAuthError(error){
    const m=String(error?.message||error||'').toLowerCase();
    if(m.includes('invalid login credentials'))return 'E-mail/telefone ou senha incorretos.';
    if(m.includes('email not confirmed'))return 'Confirme seu e-mail antes de entrar.';
    if(m.includes('user already registered'))return 'Já existe uma conta com esses dados. Use Entrar ou recuperar senha.';
    if(m.includes('password should be'))return 'A senha não atende aos requisitos de segurança.';
    if(m.includes('phone provider')||m.includes('sms provider')||m.includes('unsupported phone'))return 'O cadastro por telefone precisa do serviço de confirmação por SMS.';
    if(m.includes('rate limit'))return 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.';
    if(m.includes('signup is disabled'))return 'Criação de novas contas está temporariamente desativada.';
    return error?.message||'Não foi possível concluir o acesso agora.';
  }

  function passwordField(id,label='Senha',autocomplete='current-password'){
    return `<div class="field"><label>${label}</label><div class="auth6-password-wrap"><input id="${id}" type="password" autocomplete="${autocomplete}" minlength="8" placeholder="Mínimo 8 caracteres"><button type="button" class="auth6-show" onclick="toggleAuth6Password('${id}',this)">Mostrar</button></div></div>`;
  }

  function loginHtml(){
    return `<div class="notice">🔐 <b>Acesso IntegraTrampo.</b> Entre com seu e-mail ou telefone e sua senha. Não usamos login de redes sociais.</div>
      <h2>Acessar IntegraTrampo</h2>
      <div class="auth6-tabs"><button id="auth6TabLogin" class="is-active" onclick="auth6ShowLogin()">Entrar</button><button id="auth6TabSignup" onclick="auth6ShowSignup()">Criar conta</button></div>
      <div id="auth6Body">${loginBody()}</div>`;
  }

  function loginBody(){
    return `<div class="field"><label>E-mail ou telefone</label><input id="auth6Identifier" autocomplete="username" placeholder="nome@email.com ou (18) 99999-9999"></div>
      ${passwordField('auth6Password')}
      <div class="modal-actions"><button class="btn btn--navy" id="auth6LoginBtn" onclick="auth6PasswordLogin()">Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>
      <div class="auth6-links"><button class="auth6-link" onclick="auth6ShowRecovery()">Esqueci / criar senha</button><button class="auth6-link" onclick="auth6ShowSignup()">Ainda não tenho conta</button></div>`;
  }

  function signupBody(mode='email'){
    return `<div class="notice">👤 Crie sua conta IntegraTrampo. Se for se cadastrar como profissional, a <b>foto será obrigatória</b> e você poderá tirar na câmera ou escolher da galeria.</div>
      <div class="field"><label>Seu nome</label><input id="auth6SignupName" autocomplete="name" placeholder="Nome completo"></div>
      <div class="field full"><label>Como quer acessar?</label><div class="auth6-methods"><button type="button" id="auth6MethodEmail" class="auth6-method ${mode==='email'?'is-active':''}" onclick="auth6SignupMode('email')">✉️ E-mail</button><button type="button" id="auth6MethodPhone" class="auth6-method ${mode==='phone'?'is-active':''}" onclick="auth6SignupMode('phone')">📱 Telefone</button></div></div>
      <input type="hidden" id="auth6SignupMode" value="${mode}">
      <div class="field"><label>${mode==='email'?'E-mail':'Telefone / WhatsApp com DDD'}</label><input id="auth6SignupIdentifier" autocomplete="${mode==='email'?'email':'tel'}" inputmode="${mode==='email'?'email':'tel'}" placeholder="${mode==='email'?'nome@email.com':'(18) 99999-9999'}"></div>
      ${passwordField('auth6SignupPassword','Criar senha','new-password')}
      ${passwordField('auth6SignupConfirm','Confirmar senha','new-password')}
      <div class="auth6-help">Use pelo menos 8 caracteres. No acesso por telefone, a confirmação por SMS poderá ser exigida para proteger a conta.</div>
      <div class="modal-actions"><button class="btn btn--green" id="auth6SignupBtn" onclick="auth6Signup()">Criar conta</button><button class="btn btn--outline" onclick="auth6ShowLogin()">Já tenho conta</button></div>`;
  }

  function recoveryBody(){
    return `<div class="notice">🔑 Informe o e-mail ou telefone cadastrado para recuperar o acesso.</div>
      <h3>Recuperar acesso</h3>
      <div class="field"><label>E-mail ou telefone</label><input id="auth6RecoveryIdentifier" autocomplete="username" placeholder="nome@email.com ou (18) 99999-9999"></div>
      <div class="modal-actions"><button class="btn btn--navy" id="auth6RecoveryBtn" onclick="auth6Recover()">Continuar</button><button class="btn btn--outline" onclick="auth6ShowLogin()">Voltar</button></div>
      <div id="auth6Feedback" class="auth6-status" style="display:none"></div>`;
  }

  function renderBody(html,tab){
    const body=$id('auth6Body');if(body)body.innerHTML=html;
    $id('auth6TabLogin')?.classList.toggle('is-active',tab==='login');
    $id('auth6TabSignup')?.classList.toggle('is-active',tab==='signup');
  }

  window.toggleAuth6Password=function(id,btn){
    const input=$id(id);if(!input)return;
    const show=input.type==='password';input.type=show?'text':'password';btn.textContent=show?'Ocultar':'Mostrar';
  };

  window.auth6ShowLogin=()=>renderBody(loginBody(),'login');
  window.auth6ShowSignup=()=>renderBody(signupBody('email'),'signup');
  window.auth6ShowRecovery=()=>renderBody(recoveryBody(),'none');

  window.auth6SignupMode=function(mode){
    const oldName=$id('auth6SignupName')?.value||'',oldId=$id('auth6SignupIdentifier')?.value||'';
    renderBody(signupBody(mode),'signup');
    if($id('auth6SignupName'))$id('auth6SignupName').value=oldName;
    if($id('auth6SignupIdentifier'))$id('auth6SignupIdentifier').value=oldId;
  };

  window.loginModal=function(){
    if(!sb){tell('A autenticação ainda está carregando. Tente novamente em instantes.');return}
    sb.auth.getUser().then(({data})=>{
      if(data?.user){if(typeof go==='function')go('painel');return}
      injectStyles();modal(loginHtml());
    });
  };

  window.auth6PasswordLogin=async function(){
    const btn=$id('auth6LoginBtn'),identifier=$id('auth6Identifier')?.value.trim()||'',password=$id('auth6Password')?.value||'';
    if(!identifier||!password){tell('Informe seu e-mail/telefone e senha.');return}
    if(btn){btn.disabled=true;btn.textContent='Entrando...'}
    try{
      const creds=isEmail(identifier)?{email:identifier.toLowerCase(),password}:{phone:normalizePhone(identifier),password};
      const {error}=await sb.auth.signInWithPassword(creds);if(error)throw error;
      await syncAccountData();closeModal();tell('Acesso liberado');if(typeof go==='function')go('painel');
    }catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Entrar'}}
  };

  window.auth6Signup=async function(){
    const btn=$id('auth6SignupBtn'),name=$id('auth6SignupName')?.value.trim()||'',identifier=$id('auth6SignupIdentifier')?.value.trim()||'',mode=$id('auth6SignupMode')?.value||'email',password=$id('auth6SignupPassword')?.value||'',confirm=$id('auth6SignupConfirm')?.value||'';
    if(name.length<2){tell('Informe seu nome completo.');return}
    if(password.length<8){tell('Crie uma senha com pelo menos 8 caracteres.');return}
    if(password!==confirm){tell('As senhas não são iguais.');return}
    if(mode==='email'&&!isEmail(identifier)){tell('Informe um e-mail válido.');return}
    if(mode==='phone'&&normalizePhone(identifier).replace(/\D/g,'').length<12){tell('Informe telefone com DDD.');return}
    if(btn){btn.disabled=true;btn.textContent='Criando conta...'}
    try{
      const metadata={full_name:name,signup_source:'integratrampo',auth_method:mode};
      const payload=mode==='email'
        ?{email:identifier.toLowerCase(),password,options:{data:metadata,emailRedirectTo:loginRedirect()}}
        :{phone:normalizePhone(identifier),password,options:{data:metadata}};
      const {data,error}=await sb.auth.signUp(payload);if(error)throw error;
      if(data?.session){
        await syncAccountData();closeModal();tell('Conta criada e acesso liberado');if(typeof go==='function')go('painel');return;
      }
      if(mode==='phone'&&data?.user){showPhoneOtp(normalizePhone(identifier),'signup');return}
      renderBody(`<div class="notice">✅ Conta criada. Enviamos a confirmação para <b>${esc(identifier)}</b>. Depois de confirmar, entre com sua senha.</div><div class="modal-actions"><button class="btn btn--navy" onclick="auth6ShowLogin()">Ir para Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`,'none');
    }catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Criar conta'}}
  };

  window.auth6Recover=async function(){
    const btn=$id('auth6RecoveryBtn'),identifier=$id('auth6RecoveryIdentifier')?.value.trim()||'',fb=$id('auth6Feedback');
    if(!identifier){tell('Informe seu e-mail ou telefone.');return}
    if(btn){btn.disabled=true;btn.textContent='Enviando...'}
    try{
      if(isEmail(identifier)){
        const {error}=await sb.auth.resetPasswordForEmail(identifier.toLowerCase(),{redirectTo:loginRedirect()});if(error)throw error;
        if(fb){fb.style.display='block';fb.textContent='✅ Enviamos um link para você criar uma nova senha.'}if(btn)btn.textContent='Link enviado';
      }else{
        const phone=normalizePhone(identifier);
        const {error}=await sb.auth.signInWithOtp({phone,options:{shouldCreateUser:false}});if(error)throw error;
        showPhoneOtp(phone,'recovery');
      }
    }catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Continuar'}}
  };

  function showPhoneOtp(phone,purpose){
    renderBody(`<div class="notice">📲 Digite o código de 6 números enviado para <b>${esc(phone)}</b>.</div><h3>Confirmar telefone</h3><div class="field"><label>Código SMS</label><input id="auth6Otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div><div class="modal-actions"><button class="btn btn--green" id="auth6OtpBtn" onclick="auth6VerifyPhoneOtp('${esc(phone)}','${purpose}')">Confirmar</button><button class="btn btn--outline" onclick="auth6ShowLogin()">Cancelar</button></div>`,'none');
  }

  window.auth6VerifyPhoneOtp=async function(phone,purpose){
    const btn=$id('auth6OtpBtn'),token=$id('auth6Otp')?.value.trim()||'';
    if(!/^\d{6}$/.test(token)){tell('Digite o código de 6 números.');return}
    if(btn){btn.disabled=true;btn.textContent='Confirmando...'}
    try{
      const {error}=await sb.auth.verifyOtp({phone,token,type:'sms'});if(error)throw error;
      await syncAccountData();
      if(purpose==='recovery')showNewPasswordModal();
      else{closeModal();tell('Telefone confirmado e conta criada');if(typeof go==='function')go('painel')}
    }catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Confirmar'}}
  };

  function showNewPasswordModal(){
    injectStyles();modal(`<div class="notice">🔑 Escolha sua nova senha.</div><h2>Nova senha</h2>${passwordField('auth6NewPassword','Nova senha','new-password')}${passwordField('auth6NewConfirm','Confirmar nova senha','new-password')}<div class="modal-actions"><button class="btn btn--green" id="auth6NewBtn" onclick="auth6SetNewPassword()">Salvar nova senha</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  }

  window.auth6SetNewPassword=async function(){
    const btn=$id('auth6NewBtn'),p=$id('auth6NewPassword')?.value||'',c=$id('auth6NewConfirm')?.value||'';
    if(p.length<8){tell('Use pelo menos 8 caracteres.');return}
    if(p!==c){tell('As senhas não são iguais.');return}
    if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{
      const {error}=await sb.auth.updateUser({password:p});if(error)throw error;
      await syncAccountData();closeModal();tell('Senha atualizada');if(typeof go==='function')go('painel');
    }catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Salvar nova senha'}}
  };

  function prefillFromAccount(){
    if(!accountCache)return;
    const name=accountCache.full_name||'',email=accountCache.email||'',phone=accountCache.phone||'';
    const fill=(id,value)=>{const el=$id(id);if(el&&!el.value&&value)el.value=value};
    fill('wName',name);fill('wEmail',email);fill('wPhone',phone);
    fill('hName',name);fill('hEmail',email);fill('hPhone',phone);
    fill('pcWhatsapp',phone);fill('aceWhatsapp',phone);
  }

  async function init(){
    if(initialized)return;initialized=true;injectStyles();if(!await waitForSb())return;
    await syncAccountData();prefillFromAccount();
    sb.auth.onAuthStateChange((event)=>{
      setTimeout(async()=>{
        if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){await syncAccountData();prefillFromAccount()}
        if(event==='PASSWORD_RECOVERY')showNewPasswordModal();
      },0);
    });
    const obs=new MutationObserver(()=>prefillFromAccount());obs.observe(document.documentElement,{subtree:true,childList:true});
    window.IntegraTrampoAuthV4={sync:syncAccountData,getAccount:()=>accountCache,getSettings:()=>({external:{}}),normalizePhone};
    window.IntegraTrampoAuthSimpleV6={sync:syncAccountData,getAccount:()=>accountCache,normalizePhone};
  }

  init();
})();