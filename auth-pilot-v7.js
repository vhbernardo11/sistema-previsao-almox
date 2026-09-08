// IntegraTrampo · cadastro piloto v7
// Fase piloto: cria a conta já confirmada no backend e entra imediatamente.
// A chave administrativa permanece somente na Edge Function pilot-signup.
(function(){
  const $id=id=>document.getElementById(id);
  const tell=m=>typeof toast==='function'?toast(m):alert(m);
  const isEmail=v=>/^\S+@\S+\.\S+$/.test(String(v||'').trim());

  function normalizePhone(value){
    let d=String(value||'').replace(/\D/g,'');
    if(!d)return '';
    if(d.startsWith('00'))d=d.slice(2);
    if(d.startsWith('55')&&(d.length===12||d.length===13))return '+'+d;
    if(d.length===10||d.length===11)return '+55'+d;
    return '+'+d;
  }

  function simplifySignupCopy(){
    const help=document.querySelector('#auth6Body .auth6-help');
    if(help)help.textContent='Fase piloto: criou a conta, já pode entrar. Não pedimos confirmação por e-mail ou SMS.';
    const notice=document.querySelector('#auth6Body .notice');
    if(notice&&/Crie sua conta IntegraTrampo/i.test(notice.textContent||'')){
      notice.innerHTML='👤 <b>Cadastro simples.</b> Escolha e-mail ou telefone, crie sua senha e pronto. Para trabalhar, a foto continua obrigatória no cadastro profissional.';
    }
  }

  const previousShowSignup=window.auth6ShowSignup;
  if(typeof previousShowSignup==='function'){
    window.auth6ShowSignup=function(){previousShowSignup();setTimeout(simplifySignupCopy,0)};
  }
  const previousSignupMode=window.auth6SignupMode;
  if(typeof previousSignupMode==='function'){
    window.auth6SignupMode=function(mode){previousSignupMode(mode);setTimeout(simplifySignupCopy,0)};
  }

  window.auth6Signup=async function(){
    const sb=window.IntegraTrampoSupabase;
    const btn=$id('auth6SignupBtn');
    const name=$id('auth6SignupName')?.value.trim()||'';
    const identifier=$id('auth6SignupIdentifier')?.value.trim()||'';
    const mode=$id('auth6SignupMode')?.value||'email';
    const password=$id('auth6SignupPassword')?.value||'';
    const confirm=$id('auth6SignupConfirm')?.value||'';

    if(!sb){tell('A conexão ainda está carregando. Tente novamente em instantes.');return}
    if(name.length<2){tell('Informe seu nome completo.');return}
    if(password.length<8){tell('Crie uma senha com pelo menos 8 caracteres.');return}
    if(password!==confirm){tell('As senhas não são iguais.');return}
    if(mode==='email'&&!isEmail(identifier)){tell('Informe um e-mail válido.');return}
    const phone=mode==='phone'?normalizePhone(identifier):'';
    if(mode==='phone'&&phone.replace(/\D/g,'').length<12){tell('Informe telefone com DDD.');return}

    if(btn){btn.disabled=true;btn.textContent='Criando conta...'}
    try{
      const loginIdentifier=mode==='email'?identifier.toLowerCase():phone;
      const {data,error}=await sb.functions.invoke('pilot-signup',{
        body:{name,identifier:loginIdentifier,mode,password}
      });

      if(error||!data?.ok){
        // Se a conta já existia, tentamos simplesmente entrar com a senha informada.
        const creds=mode==='email'?{email:loginIdentifier,password}:{phone:loginIdentifier,password};
        const loginTry=await sb.auth.signInWithPassword(creds);
        if(loginTry.error){
          if(data?.code==='already_exists'||String(error?.message||'').toLowerCase().includes('non-2xx')){
            throw new Error('Já existe uma conta com esse e-mail ou telefone. Use Entrar ou Esqueci minha senha.');
          }
          throw error||new Error('Não foi possível criar a conta agora.');
        }
      }else{
        const creds=mode==='email'?{email:loginIdentifier,password}:{phone:loginIdentifier,password};
        const {error:loginError}=await sb.auth.signInWithPassword(creds);
        if(loginError)throw loginError;
      }

      try{await sb.rpc('it_sync_my_auth_data_v4')}catch(_){}
      try{
        const {data:{user}}=await sb.auth.getUser();
        if(user)window.IntegraTrampoAuthAccount={
          email:user.email||null,phone:user.phone||null,
          full_name:user.user_metadata?.full_name||name,
          provider:'password',email_verified:!!user.email_confirmed_at,phone_verified:!!user.phone_confirmed_at
        };
      }catch(_){}

      if(typeof closeModal==='function')closeModal();
      tell('Conta criada. Acesso liberado!');
      if(typeof go==='function')go('painel');
    }catch(e){
      const msg=String(e?.message||e||'Não foi possível criar a conta agora.');
      if(/email not confirmed/i.test(msg))tell('Essa conta antiga estava pendente. Atualize a página e tente entrar novamente.');
      else if(/invalid login credentials/i.test(msg))tell('Já existe uma conta com esses dados. Entre com a senha correta ou recupere o acesso.');
      else tell(msg);
      if(btn){btn.disabled=false;btn.textContent='Criar conta'}
    }
  };

  // Ajusta também o texto caso o formulário já esteja aberto quando esta camada carregar.
  setTimeout(simplifySignupCopy,0);
  window.IntegraTrampoPilotAuthV7={version:7,noSignupConfirmation:true};
})();
