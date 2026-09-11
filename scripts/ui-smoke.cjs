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

    const navTargets=['profissionais','vagas','empresas','painel'];
    for(const target of navTargets){
      await page.evaluate(t=>window.go?.(t),target);
      await page.waitForTimeout(90);
      const active=await page.locator(`#screen-${target}`).evaluate(el=>el.classList.contains('is-active'));
      assert.equal(active,true,`Tela ${target} não ficou ativa`);
    }
    await page.evaluate(()=>window.go?.('home'));

    const hire=page.getByRole('button',{name:/Quero contratar|Preciso contratar/i}).first();
    if(await hire.count()){
      await hire.click();await waitModal();
      assert.match(await modalText(),/contratar|pedido|entrar|conta|vaga|profissional/i,'Fluxo de contratação não abriu');
      await closeModal();
    }

    await page.getByRole('button',{name:/Quero trabalhar/i}).first().click();
    await waitModal();
    assert.match(await modalText(),/trabalhar|entrar|conta|cadastro|foto|senha/i,'Fluxo Quero trabalhar não abriu');
    await closeModal();

    const loginCalled=await page.evaluate(()=>window.IntegraTrampoUICoreV8.callLatest('loginModal'));
    assert.equal(loginCalled,true,'loginModal não está disponível');
    await waitModal();
    assert.match(await modalText(),/entrar|acessar|conta|senha/i,'Login não abriu');
    await closeModal();

    const notify=page.locator('#notifyBtn');
    if(await notify.isVisible()){
      await notify.click();await waitModal();
      assert.match(await modalText(),/notifica|central de atividades|atividade|piloto|foto|cadastro/i,'Sino não abriu conteúdo válido');
      await closeModal();
    }

    await page.waitForFunction(()=>window.IntegraTrampoStage11Favorites?.version===11,{timeout:12000});
    assert.equal(await page.evaluate(()=>window.IntegraTrampoStage11Favorites?.version||0),11,'Etapa 11 não foi carregada');
    await page.evaluate(()=>window.openStage11Favorites?.());await waitModal();
    assert.match(await modalText(),/favoritos|sincronizados|conta|entrar/i,'Etapa 11 não abriu o fluxo de favoritos');await closeModal();

    const firstProfessionalId=await page.evaluate(()=>Array.isArray(window.publicPros)&&window.publicPros.length?window.publicPros[0].id:(typeof publicPros!=='undefined'&&Array.isArray(publicPros)&&publicPros.length?publicPros[0].id:null));
    if(firstProfessionalId){
      await page.evaluate(id=>window.openPro?.(id),firstProfessionalId);await waitModal();await page.waitForTimeout(80);
      assert.equal(await page.locator('#modalRoot [data-stage11-pro]').count(),1,'Perfil não recebeu ação de favorito da Etapa 11');await closeModal();
    }

    await page.waitForFunction(()=>window.IntegraTrampoStage12Recommendations?.version===12,{timeout:12000});
    assert.equal(await page.evaluate(()=>window.IntegraTrampoStage12Recommendations?.version||0),12,'Etapa 12 não foi carregada');
    await page.evaluate(()=>window.openStage12Recommendations?.());await waitModal();
    assert.match(await modalText(),/recomenda|afinidade|personaliz|conta|entrar/i,'Etapa 12 não abriu o fluxo de recomendações');await closeModal();

    await page.waitForFunction(()=>window.IntegraTrampoStage13Alerts?.version===13,{timeout:12000});
    assert.equal(await page.evaluate(()=>window.IntegraTrampoStage13Alerts?.version||0),13,'Etapa 13 não foi carregada');
    await page.evaluate(()=>window.openStage13Alerts?.());await waitModal();
    assert.match(await modalText(),/alertas|afinidade|conta|entrar/i,'Etapa 13 não abriu o fluxo de alertas inteligentes');await closeModal();

    await page.waitForFunction(()=>window.IntegraTrampoStage14Search?.version===14,{timeout:12000});
    assert.equal(await page.evaluate(()=>window.IntegraTrampoStage14Search?.version||0),14,'Etapa 14 não foi carregada');
    await page.evaluate(()=>window.go?.('vagas'));await page.waitForTimeout(120);
    assert.equal(await page.locator('#screen-vagas [data-stage14-entry]').count(),1,'Vagas não recebeu botão de busca avançada');
    await page.evaluate(()=>window.go?.('profissionais'));await page.waitForTimeout(120);
    assert.equal(await page.locator('#screen-profissionais [data-stage14-entry]').count(),1,'Profissionais não recebeu botão de busca avançada');
    await page.evaluate(()=>window.openStage14Search?.('all'));await waitModal();
    assert.match(await modalText(),/busca inteligente|filtros|vagas|profissionais|afinidade/i,'Etapa 14 não abriu a busca inteligente');

    // Etapa 15 deve carregar depois da busca, injetar a ação de salvar e manter fluxo seguro para visitante.
    await page.waitForFunction(()=>window.IntegraTrampoStage15SavedSearches?.version===15,{timeout:12000});
    assert.equal(await page.evaluate(()=>window.IntegraTrampoStage15SavedSearches?.version||0),15,'Etapa 15 não foi carregada');
    await page.waitForTimeout(120);
    assert.equal(await page.locator('#modalRoot [data-stage15-save-search]').count(),1,'Busca avançada não recebeu ação de salvar busca');
    await closeModal();
    await page.evaluate(()=>window.openStage15SavedSearches?.());await waitModal();
    assert.match(await modalText(),/buscas salvas|conta|entrar|filtros/i,'Etapa 15 não abriu o fluxo de buscas salvas');await closeModal();

    await page.waitForSelector('#adminAccessBtn',{state:'attached',timeout:12000});
    const adm=page.locator('#adminAccessBtn');
    if(await adm.isVisible()){
      await adm.click();await waitModal();
      assert.match(await modalText(),/ADM|administr|senha|login/i,'Acesso ADM não abriu o login administrativo');await closeModal();
    }

    if(errors.length)throw new Error(`Erros de página: ${errors.join(' | ')}`);
    console.log('UI_SMOKE_OK');
  }finally{await browser.close()}
})().catch(err=>{console.error('UI_SMOKE_FAIL');console.error(err);process.exit(1)});
