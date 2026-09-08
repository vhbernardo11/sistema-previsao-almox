const { chromium } = require('playwright');
const assert = require('node:assert/strict');

(async()=>{
  const browser=await chromium.launch({headless:true});
  const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});
  const pageErrors=[];
  page.on('pageerror',err=>pageErrors.push(String(err?.stack||err)));

  try{
    await page.goto('http://127.0.0.1:4173/',{waitUntil:'domcontentloaded',timeout:30000});
    await page.waitForFunction(()=>window.IntegraTrampoUICoreV8&&typeof window.IntegraTrampoUICoreV8.report==='function',null,{timeout:12000});

    const active=async id=>page.evaluate(x=>document.getElementById(`screen-${x}`)?.classList.contains('is-active'),id);
    const closeModal=async()=>page.evaluate(()=>{if(typeof window.closeModal==='function')window.closeModal();else{const r=document.getElementById('modalRoot');if(r)r.innerHTML=''}});
    const modalText=()=>page.locator('#modalRoot').innerText();
    const waitModal=()=>page.waitForFunction(()=>document.getElementById('modalRoot')?.innerText.trim().length>0,{timeout:6000});

    // Hero: ver oportunidades com toque real.
    await page.getByRole('button',{name:/Ver oportunidades/i}).click();
    assert.equal(await active('vagas'),true,'Ver oportunidades não abriu a tela Vagas');

    // Todas as telas públicas devem ser alcançáveis pelo roteador.
    for(const id of ['home','vagas','profissionais','empresas','painel','operacao']){
      const ok=await page.evaluate(x=>window.IntegraTrampoUICoreV8.navigate(x),id);
      assert.equal(ok,true,`Roteador recusou ${id}`);
      assert.equal(await active(id),true,`Navegação para ${id} falhou`);
    }

    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));

    // Contratação: os dois CTAs precisam abrir uma tela/modal utilizável.
    await page.getByRole('button',{name:/Preciso contratar/i}).first().click();
    await waitModal();
    assert.match(await modalText(),/contrat|empresa|necessidade/i,'Modal de contratação não abriu conteúdo válido');
    await closeModal();

    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));
    const hireCount=await page.getByRole('button',{name:/Preciso contratar/i}).count();
    if(hireCount>1){
      await page.getByRole('button',{name:/Preciso contratar/i}).nth(hireCount-1).click();
      await waitModal();
      assert.match(await modalText(),/contrat|empresa|necessidade/i,'Segundo botão Preciso contratar não respondeu');
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

    // Sino/notificações precisa responder no layout móvel.
    const notify=page.locator('#notifyBtn');
    if(await notify.isVisible()){
      await notify.click();await waitModal();
      assert.match(await modalText(),/notifica|piloto|foto|cadastro/i,'Notificações não abriram conteúdo válido');
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

    // Filtros e botões Limpar.
    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('vagas'));
    await page.locator('#jobQuery').fill('chapeiro');
    await page.locator('#clearJobs').click();
    assert.equal(await page.locator('#jobQuery').inputValue(),'','Limpar vagas não limpou a busca');

    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('profissionais'));
    await page.locator('#proQuery').fill('garçom');
    await page.locator('#clearPros').click();
    assert.equal(await page.locator('#proQuery').inputValue(),'','Limpar profissionais não limpou a busca');

    // Todos os 22 botões de categorias precisam levar a Vagas, não só uma amostra.
    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));
    const categoryButtons=page.locator('#categoryGrid button');
    const categories=await categoryButtons.count();
    assert.equal(categories,22,`Catálogo de áreas deveria ter 22 opções, encontrou ${categories}`);
    for(let i=0;i<categories;i++){
      await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));
      await categoryButtons.nth(i).click();
      assert.equal(await active('vagas'),true,`Categoria ${i+1} não abriu Vagas`);
    }

    // Cartões: abre/fecha os principais detalhes sem efetuar escrita no banco.
    async function testCard(screen,buttonName,expected){
      await page.evaluate(x=>window.IntegraTrampoUICoreV8.navigate(x),screen);
      const btn=page.getByRole('button',{name:buttonName}).first();
      if(await btn.count()){
        await btn.click();await waitModal();
        assert.match(await modalText(),expected,`${buttonName} não abriu conteúdo válido`);
        await closeModal();
      }
    }
    await testCard('vagas',/Ver vaga/i,/oportunidade|vaga|diária|contrat/i);
    await testCard('profissionais',/Ver perfil/i,/perfil|profissional|diária|avalia/i);
    await testCard('empresas',/Ver empresa/i,/empresa|contratante|reputa|cadastro/i);

    // Dá tempo para todas as camadas assíncronas terminarem e roda diagnóstico de handlers.
    await page.waitForTimeout(5000);
    const health=await page.evaluate(()=>window.IntegraTrampoUICoreV8.report());
    assert.equal(health.ok,true,`Diagnóstico da UI encontrou problemas: ${health.issues.join('; ')}`);
    assert.equal(pageErrors.length,0,`Erros JavaScript não tratados: ${pageErrors.join('\n---\n')}`);

    console.log('UI_SMOKE_OK');
    console.log(JSON.stringify({categories,health},null,2));
  } finally {
    await browser.close();
  }
})().catch(err=>{console.error('UI_SMOKE_FAIL');console.error(err);process.exit(1)});
