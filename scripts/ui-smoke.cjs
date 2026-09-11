const {chromium}=require('playwright');
const assert=require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844}});
  const errors=[];
  page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded'});
    await page.waitForTimeout(900);

    const waitModal=()=>page.waitForSelector('#modalRoot .modal',{state:'visible',timeout:12000});
    const modalText=()=>page.locator('#modalRoot .modal').innerText();
    const closeModal=async()=>{
      const close=page.locator('#modalRoot .modal .modal-actions button').filter({hasText:/Fechar|Cancelar|Voltar/i}).last();
      if(await close.count())await close.click();else await page.evaluate(()=>window.closeModal?.());
      await page.waitForTimeout(80);
    };

    // Navegação principal precisa responder.
    const navTargets=['profissionais','oportunidades','empresas','painel'];
    for(const target of navTargets){
      await page.evaluate(t=>window.go?.(t),target);
      await page.waitForTimeout(90);
      const active=await page.locator(`#screen-${target}`).evaluate(el=>el.classList.contains('is-active'));
      assert.equal(active,true,`Tela ${target} não ficou ativa`);
    }
    await page.evaluate(()=>window.go?.('inicio'));

    // Botão Quero contratar precisa abrir fluxo válido.
    const hire=page.getByRole('button',{name:/Quero contratar/i}).first();
    if(await hire.count()){
      await hire.click();await waitModal();
      assert.match(await modalText(),/contratar|pedido|entrar|conta|vaga|profissional/i,'Fluxo Quero contratar não abriu');
      await closeModal();
    }

    // Quero trabalhar pode abrir cadastro diretamente ou pedir login; ambos são válidos.
    await page.getByRole('button',{name:/Quero trabalhar/i}).first().click();
    await waitModal();
    assert.match(await modalText(),/trabalhar|entrar|conta|cadastro|foto|senha/i,'Fluxo Quero trabalhar não abriu');
    await closeModal();

    // Login próprio precisa abrir.
    const loginCalled=await page.evaluate(()=>window.IntegraTrampoUICoreV8.callLatest('loginModal'));
    assert.equal(loginCalled,true,'loginModal não está disponível');
    await waitModal();
    assert.match(await modalText(),/entrar|acessar|conta|senha/i,'Login não abriu');
    await closeModal();

    // Sino agora pode abrir notificações legadas ou a Central de Atividades da Etapa 10.
    const notify=page.locator('#notifyBtn');
    if(await notify.isVisible()){
      await notify.click();await waitModal();
      assert.match(await modalText(),/notifica|central de atividades|atividade|piloto|foto|cadastro/i,'Sino não abriu conteúdo válido');
      await closeModal();
    }

    // Central ADM deve ao menos abrir a autenticação administrativa sem credenciais.
    await page.waitForSelector('#adminAccessBtn',{state:'attached',timeout:12000});
    const adm=page.locator('#adminAccessBtn');
    if(await adm.isVisible()){
      await adm.click();await waitModal();
      assert.match(await modalText(),/ADM|administr|senha|login/i,'Acesso ADM não abriu o login administrativo');
      await closeModal();
    }

    // Nenhuma exceção JavaScript não tratada deve ocorrer no caminho crítico.
    if(errors.length)throw new Error(`Erros de página: ${errors.join(' | ')}`);
    console.log('UI_SMOKE_OK');
  }finally{
    await browser.close();
  }
})().catch(err=>{console.error('UI_SMOKE_FAIL');console.error(err);process.exit(1)});
