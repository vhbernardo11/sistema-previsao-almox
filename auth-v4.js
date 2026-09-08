// IntegraTrampo · autenticação v4
// E-mail/telefone + senha, Google/Facebook OAuth e reaproveitamento seguro dos dados da conta.
(function(){
  let sb=null;
  let accountCache=null;
  let settingsCache=null;
  let initialized=false;
  const $id=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const tell=m=>typeof toast==='function'?toast(m):alert(m);
  const isEmail=v=>/^\S+@\S+\.\S+$/.test(String(v||'').trim());
  const sleep=ms=>new Promise(r=>setTimeout(r,ms));

  function injectStyles(){
    if($id('itAuthV4Styles'))return;
    const s=document.createElement('style');s.id='itAuthV4Styles';s.textContent=`
      .auth4-tabs{display:grid;grid-template-columns:1fr 1fr;gap:7px;background:#f1f5f9;padding:5px;border-radius:14px;margin:10px 0 15px}.auth4-tabs button{border:0;background:transparent;border-radius:10px;padding:10px 8px;font-weight:850;color:#64748b;cursor:pointer}.auth4-tabs button.is-active{background:#fff;color:#0D1B2A;box-shadow:0 2px 10px rgba(13,27,42,.08)}
      .auth4-social{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-top:12px}.auth4-social button{display:flex;align-items:center;justify-content:center;gap:8px;min-height:46px;border:1px solid #dbe4ee;border-radius:13px;background:#fff;color:#0D1B2A;font-weight:850;cursor:pointer}.auth4-social button:disabled{opacity:.5;cursor:not-allowed}.auth4-provider-icon{width:24px;height:24px;border-radius:50%;display:grid;place-items:center;font-weight:900}.auth4-provider-google{border:1px solid #e2e8f0;color:#4285F4}.auth4-provider-facebook{background:#1877F2;color:#fff}
      .auth4-divider{display:flex;align-items:center;gap:10px;color:#94a3b8;font-size:12px;margin:14px 0}.auth4-divider:before,.auth4-divider:after{content:'';height:1px;background:#e2e8f0;flex:1}.auth4-help{font-size:12px;color:#64748b;line-height:1.5;margin-top:7px}.auth4-links{display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-top:12px}.auth4-link{border:0;background:transparent;color:#1976D2;font-weight:800;padding:0;cursor:pointer}.auth4-methods{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-bottom:10px}.auth4-method{border:1px solid #dbe4ee;background:#fff;border-radius:12px;padding:10px;font-weight:800;cursor:pointer}.auth4-method.is-active{border-color:#16B898;background:#ecfdf8;box-shadow:0 0 0 1px #16B898 inset}.auth4-status{padding:9px 11px;border-radius:11px;background:#f8fafc;border:1px solid #e2e8f0;font-size:12px;color:#475569;margin-top:10px}.auth4-password-wrap{position:relative}.auth4-password-wrap input{padding-right:76px}.auth4-show{position:absolute;right:9px;top:50%;transform:translateY(-50%);border:0;background:transparent;color:#1976D2;font-weight:800;cursor:pointer;font-size:12px}
      @media(max-width:430px){.auth4-social{grid-template-columns:1fr}.auth4-links{flex-direction:column;align-items:flex-start}}
    `;document.head.appendChild(s);
  }

  function normalizePhone(value){
    let d=String(value||'').replace(/\D/g,'');
    if(!d)return '';
    if(d.startsWith('00'))d=d.slice(2);
    if(d.startsWith('55')&&(d.length===12||d.length===13))return '+'+d;
    if(d.length===10||d.length===11)return '+55'+d;
    return '+'+d;
  }

  function loginRedirect(){
    return `${window.location.origin}${window.location.pathname}`;
  }

  async function waitForSb(){
    for(let i=0;i<120&&!window.IntegraTrampoSupabase;i++)await sleep(50);
    sb=window.IntegraTrampoSupabase||null;
    return sb;
  }

  async function authSettings(){
    if(settingsCache)return settingsCache;
    try{
      const r=await fetch(`${SUPABASE_URL}/auth/v1/settings`,{headers:{apikey:SUPABASE_KEY}});
      if(r.ok)settingsCache=await r.json();
    }catch(e){console.warn('auth settings',e)}
    return settingsCache||{};
  }

  function providerEnabled(name){
    const external=settingsCache?.external;
    if(!external||typeof external[name]!=='boolean')return null;
    return external[name];
  }

  async function syncAccountData(){
    if(!sb)return null;
    try{
      const {data:{user}}=await sb.auth.getUser();
      if(!user){accountCache=null;return null}
      const {data,error}=await sb.rpc('it_sync_my_auth_data_v4');
      if(error)throw error;
      accountCache=data?.account||{
        email:user.email||null,phone:user.phone||null,full_name:user.user_metadata?.full_name||user.user_metadata?.name||null,
        avatar_url:user.user_metadata?.avatar_url||user.user_metadata?.picture||null,provider:user.app_metadata?.provider||null
      };
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
    if(m.includes('provider is not enabled')||m.includes('unsupported provider'))return 'Esse método de acesso ainda não foi ativado na IntegraTrampo.';
    if(m.includes('phone provider')||m.includes('sms provider')||m.includes('unsupported phone'))return 'Acesso por telefone precisa da ativação do serviço de SMS.';
    if(m.includes('rate limit'))return 'Muitas tentativas seguidas. Aguarde um pouco e tente novamente.';
    if(m.includes('signup is disabled'))return 'Criação de novas contas está temporariamente desativada.';
    return error?.message||'Não foi possível concluir o acesso agora.';
  }

  function passwordField(id,label='Senha',autocomplete='current-password'){
    return `<div class="field"><label>${label}</label><div class="auth4-password-wrap"><input id="${id}" type="password" autocomplete="${autocomplete}" minlength="8" placeholder="Mínimo 8 caracteres"><button type="button" class="auth4-show" onclick="toggleAuthV4Password('${id}',this)">Mostrar</button></div></div>`;
  }

  function socialButtons(){
    return `<div class="auth4-divider">ou continue com</div><div class="auth4-social">
      <button type="button" id="auth4Google" onclick="authV4Social('google')"><span class="auth4-provider-icon auth4-provider-google">G</span> Google</button>
      <button type="button" id="auth4Facebook" onclick="authV4Social('facebook')"><span class="auth4-provider-icon auth4-provider-facebook">f</span> Facebook</button>
    </div><div id="auth4ProviderStatus" class="auth4-help"></div>`;
  }

  function loginHtml(){
    return `<div class="notice">🔐 Entre com senha ou use sua conta Google/Facebook. Seus cadastros anteriores são associados à conta sem duplicar dados.</div>
      <h2>Acessar IntegraTrampo</h2>
      <div class="auth4-tabs"><button id="auth4TabLogin" class="is-active" onclick="authV4ShowLogin()">Entrar</button><button id="auth4TabSignup" onclick="authV4ShowSignup()">Criar conta</button></div>
      <div id="auth4Body">${loginBody()}</div>`;
  }

  function loginBody(){
    return `<div class="field"><label>E-mail ou telefone</label><input id="auth4Identifier" autocomplete="username" placeholder="nome@email.com ou (18) 99999-9999"></div>
      ${passwordField('auth4Password')}
      <div class="modal-actions"><button class="btn btn--navy" id="auth4LoginBtn" onclick="authV4PasswordLogin()">Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>
      ${socialButtons()}
      <div class="auth4-links"><button class="auth4-link" onclick="authV4ShowRecovery()">Esqueci / criar senha</button><button class="auth4-link" onclick="authV4ShowSignup()">Ainda não tenho conta</button></div>`;
  }

  function signupBody(mode='email'){
    return `<div class="field"><label>Seu nome</label><input id="auth4SignupName" autocomplete="name" placeholder="Nome completo"></div>
      <div class="field full"><label>Como quer acessar?</label><div class="auth4-methods"><button type="button" id="auth4MethodEmail" class="auth4-method ${mode==='email'?'is-active':''}" onclick="authV4SignupMode('email')">✉️ E-mail</button><button type="button" id="auth4MethodPhone" class="auth4-method ${mode==='phone'?'is-active':''}" onclick="authV4SignupMode('phone')">📱 Telefone</button></div></div>
      <input type="hidden" id="auth4SignupMode" value="${mode}">
      <div class="field"><label id="auth4SignupIdentifierLabel">${mode==='email'?'E-mail':'Telefone / WhatsApp com DDD'}</label><input id="auth4SignupIdentifier" autocomplete="${mode==='email'?'email':'tel'}" inputmode="${mode==='email'?'email':'tel'}" placeholder="${mode==='email'?'nome@email.com':'(18) 99999-9999'}"></div>
      ${passwordField('auth4SignupPassword','Criar senha','new-password')}
      ${passwordField('auth4SignupConfirm','Confirmar senha','new-password')}
      <div class="auth4-help">Use pelo menos 8 caracteres. O telefone, quando usado como acesso, pode exigir confirmação por SMS.</div>
      <div class="modal-actions"><button class="btn btn--green" id="auth4SignupBtn" onclick="authV4Signup()">Criar conta</button><button class="btn btn--outline" onclick="authV4ShowLogin()">Já tenho conta</button></div>
      ${socialButtons()}`;
  }

  function recoveryBody(){
    return `<div class="notice">🔑 Informe o e-mail ou telefone da sua conta. Por e-mail você receberá um link; por telefone, um código SMS quando esse serviço estiver ativado.</div>
      <h3>Recuperar acesso</h3><div class="field"><label>E-mail ou telefone</label><input id="auth4RecoveryIdentifier" autocomplete="username" placeholder="nome@email.com ou (18) 99999-9999"></div>
      <div class="modal-actions"><button class="btn btn--navy" id="auth4RecoveryBtn" onclick="authV4Recover()">Continuar</button><button class="btn btn--outline" onclick="authV4ShowLogin()">Voltar</button></div><div id="auth4Feedback" class="auth4-status" style="display:none"></div>`;
  }

  function renderBody(html,tab){
    const body=$id('auth4Body');if(body)body.innerHTML=html;
    $id('auth4TabLogin')?.classList.toggle('is-active',tab==='login');
    $id('auth4TabSignup')?.classList.toggle('is-active',tab==='signup');
    setTimeout(refreshProviderButtons,0);
  }

  window.toggleAuthV4Password=function(id,btn){const input=$id(id);if(!input)return;const show=input.type==='password';input.type=show?'text':'password';btn.textContent=show?'Ocultar':'Mostrar'};
  window.authV4ShowLogin=()=>renderBody(loginBody(),'login');
  window.authV4ShowSignup=()=>renderBody(signupBody('email'),'signup');
  window.authV4ShowRecovery=()=>renderBody(recoveryBody(),'none');
  window.authV4SignupMode=function(mode){
    const oldName=$id('auth4SignupName')?.value||'',oldId=$id('auth4SignupIdentifier')?.value||'';
    renderBody(signupBody(mode),'signup');
    if($id('auth4SignupName'))$id('auth4SignupName').value=oldName;
    if($id('auth4SignupIdentifier'))$id('auth4SignupIdentifier').value=oldId;
  };

  async function refreshProviderButtons(){
    await authSettings();
    const g=$id('auth4Google'),f=$id('auth4Facebook'),status=$id('auth4ProviderStatus');
    const ge=providerEnabled('google'),fe=providerEnabled('facebook');
    if(g&&ge===false){g.disabled=true;g.title='Google ainda não configurado no Supabase'}
    if(f&&fe===false){f.disabled=true;f.title='Facebook ainda não configurado no Supabase'}
    if(status){
      const missing=[];if(ge===false)missing.push('Google');if(fe===false)missing.push('Facebook');
      status.textContent=missing.length?`${missing.join(' e ')}: configuração externa ainda pendente.`:'';
    }
  }

  window.loginModal=function(){
    if(!sb){tell('A autenticação ainda está carregando. Tente novamente em instantes.');return}
    sb.auth.getUser().then(({data})=>{if(data?.user){go('painel');return}injectStyles();modal(loginHtml());refreshProviderButtons()});
  };

  window.authV4PasswordLogin=async function(){
    const btn=$id('auth4LoginBtn'),identifier=$id('auth4Identifier')?.value.trim()||'',password=$id('auth4Password')?.value||'';
    if(password.length<1||!identifier){tell('Informe seu e-mail/telefone e senha.');return}
    if(btn){btn.disabled=true;btn.textContent='Entrando...'}
    try{
      const creds=isEmail(identifier)?{email:identifier.toLowerCase(),password}:{phone:normalizePhone(identifier),password};
      const {error}=await sb.auth.signInWithPassword(creds);if(error)throw error;
      await syncAccountData();closeModal();tell('Acesso liberado');go('painel');
    }catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Entrar'}}
  };

  window.authV4Signup=async function(){
    const btn=$id('auth4SignupBtn'),name=$id('auth4SignupName')?.value.trim()||'',identifier=$id('auth4SignupIdentifier')?.value.trim()||'',mode=$id('auth4SignupMode')?.value||'email',password=$id('auth4SignupPassword')?.value||'',confirm=$id('auth4SignupConfirm')?.value||'';
    if(name.length<2){tell('Informe seu nome completo.');return}if(password.length<8){tell('Crie uma senha com pelo menos 8 caracteres.');return}if(password!==confirm){tell('As senhas não são iguais.');return}
    if(mode==='email'&&!isEmail(identifier)){tell('Informe um e-mail válido.');return}if(mode==='phone'&&normalizePhone(identifier).replace(/\D/g,'').length<12){tell('Informe telefone com DDD.');return}
    if(btn){btn.disabled=true;btn.textContent='Criando conta...'}
    try{
      const options={data:{full_name:name,signup_source:'integratrampo'},emailRedirectTo:loginRedirect()};
      const payload=mode==='email'?{email:identifier.toLowerCase(),password,options}:{phone:normalizePhone(identifier),password,options:{data:options.data}};
      const {data,error}=await sb.auth.signUp(payload);if(error)throw error;
      if(data?.session){await syncAccountData();closeModal();tell('Conta criada e acesso liberado');go('painel');return}
      if(mode==='phone'&&data?.user){showPhoneOtp(normalizePhone(identifier),'signup');return}
      const feedback=`Conta criada. Enviamos a confirmação para ${esc(identifier)}. Depois de confirmar, entre com sua senha.`;
      renderBody(`<div class="notice">✅ ${feedback}</div><div class="modal-actions"><button class="btn btn--navy" onclick="authV4ShowLogin()">Ir para Entrar</button><button class="btn btn--outline" onclick="closeModal()">Fechar</button></div>`,'none');
    }catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Criar conta'}}
  };

  window.authV4Social=async function(provider){
    try{
      const btn=$id(provider==='google'?'auth4Google':'auth4Facebook');if(btn){btn.disabled=true;btn.textContent='Abrindo...'}
      const {error}=await sb.auth.signInWithOAuth({provider,options:{redirectTo:loginRedirect()}});if(error)throw error;
    }catch(e){tell(friendlyAuthError(e));refreshProviderButtons()}
  };

  window.authV4Recover=async function(){
    const btn=$id('auth4RecoveryBtn'),identifier=$id('auth4RecoveryIdentifier')?.value.trim()||'',fb=$id('auth4Feedback');if(!identifier){tell('Informe seu e-mail ou telefone.');return}
    if(btn){btn.disabled=true;btn.textContent='Enviando...'}
    try{
      if(isEmail(identifier)){
        const {error}=await sb.auth.resetPasswordForEmail(identifier.toLowerCase(),{redirectTo:loginRedirect()});if(error)throw error;
        if(fb){fb.style.display='block';fb.textContent='✅ Enviamos um link para você criar uma nova senha.'}if(btn)btn.textContent='Link enviado';
      }else{
        const phone=normalizePhone(identifier);const {error}=await sb.auth.signInWithOtp({phone,options:{shouldCreateUser:false}});if(error)throw error;showPhoneOtp(phone,'recovery');
      }
    }catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Continuar'}}
  };

  function showPhoneOtp(phone,purpose){
    renderBody(`<div class="notice">📲 Digite o código de 6 números enviado para <b>${esc(phone)}</b>.</div><h3>Confirmar telefone</h3><div class="field"><label>Código SMS</label><input id="auth4Otp" inputmode="numeric" autocomplete="one-time-code" maxlength="6" placeholder="000000"></div><div class="modal-actions"><button class="btn btn--green" id="auth4OtpBtn" onclick="authV4VerifyPhoneOtp('${esc(phone)}','${purpose}')">Confirmar</button><button class="btn btn--outline" onclick="authV4ShowLogin()">Cancelar</button></div>`,'none');
  }

  window.authV4VerifyPhoneOtp=async function(phone,purpose){
    const btn=$id('auth4OtpBtn'),token=$id('auth4Otp')?.value.trim()||'';if(!/^\d{6}$/.test(token)){tell('Digite o código de 6 números.');return}if(btn){btn.disabled=true;btn.textContent='Confirmando...'}
    try{const {error}=await sb.auth.verifyOtp({phone,token,type:'sms'});if(error)throw error;await syncAccountData();if(purpose==='recovery'){showNewPasswordModal()}else{closeModal();tell('Telefone confirmado e conta criada');go('painel')}}catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Confirmar'}}
  };

  function showNewPasswordModal(){
    injectStyles();modal(`<div class="notice">🔑 Escolha sua nova senha.</div><h2>Nova senha</h2>${passwordField('auth4NewPassword','Nova senha','new-password')}${passwordField('auth4NewConfirm','Confirmar nova senha','new-password')}<div class="modal-actions"><button class="btn btn--green" id="auth4NewBtn" onclick="authV4SetNewPassword()">Salvar nova senha</button><button class="btn btn--outline" onclick="closeModal()">Cancelar</button></div>`);
  }

  window.authV4SetNewPassword=async function(){
    const btn=$id('auth4NewBtn'),p=$id('auth4NewPassword')?.value||'',c=$id('auth4NewConfirm')?.value||'';if(p.length<8){tell('Use pelo menos 8 caracteres.');return}if(p!==c){tell('As senhas não são iguais.');return}if(btn){btn.disabled=true;btn.textContent='Salvando...'}
    try{const {error}=await sb.auth.updateUser({password:p});if(error)throw error;await syncAccountData();closeModal();tell('Senha atualizada');go('painel')}catch(e){tell(friendlyAuthError(e));if(btn){btn.disabled=false;btn.textContent='Salvar nova senha'}}
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
    await authSettings();await syncAccountData();prefillFromAccount();
    sb.auth.onAuthStateChange((event)=>{setTimeout(async()=>{if(event==='SIGNED_IN'||event==='TOKEN_REFRESHED'||event==='USER_UPDATED'){await syncAccountData();prefillFromAccount()}if(event==='PASSWORD_RECOVERY')showNewPasswordModal()},0)});
    const obs=new MutationObserver(()=>prefillFromAccount());obs.observe(document.documentElement,{subtree:true,childList:true});
    window.IntegraTrampoAuthV4={sync:syncAccountData,getAccount:()=>accountCache,getSettings:()=>settingsCache,normalizePhone};
  }

  init();
})();