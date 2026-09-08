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

    // Hero: ver oportunidades
    await page.getByRole('button',{name:/Ver oportunidades/i}).click();
    assert.equal(await active('vagas'),true,'Ver oportunidades não abriu a tela Vagas');

    // Todas as telas públicas devem ser alcançáveis pelo roteador.
    for(const id of ['home','vagas','profissionais','empresas','painel','operacao']){
      const ok=await page.evaluate(x=>window.IntegraTrampoUICoreV8.navigate(x),id);
      assert.equal(ok,true,`Roteador recusou ${id}`);
      assert.equal(await active(id),true,`Navegação para ${id} falhou`);
    }

    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));

    // Contratação precisa abrir modal, mesmo que camadas posteriores substituam a função.
    await page.getByRole('button',{name:/Preciso contratar/i}).first().click();
    await page.waitForFunction(()=>document.getElementById('modalRoot')?.innerText.trim().length>0,{timeout:5000});
    assert.match(await modalText(),/contrat|empresa|necessidade/i,'Modal de contratação não abriu conteúdo válido');
    await closeModal();

    // Segundo CTA de contratação também precisa responder.
    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));
    const hireCount=await page.getByRole('button',{name:/Preciso contratar/i}).count();
    if(hireCount>1){
      await page.getByRole('button',{name:/Preciso contratar/i}).nth(hireCount-1).click();
      await page.waitForFunction(()=>document.getElementById('modalRoot')?.innerText.trim().length>0,{timeout:5000});
      assert.match(await modalText(),/contrat|empresa|necessidade/i,'Segundo botão Preciso contratar não respondeu');
      await closeModal();
    }

    // Quero trabalhar pode abrir cadastro diretamente ou pedir login; ambos são fluxos válidos.
    await page.getByRole('button',{name:/Quero trabalhar/i}).first().click();
    await page.waitForFunction(()=>document.getElementById('modalRoot')?.innerText.trim().length>0,{timeout:5000});
    assert.match(await modalText(),/trabalhar|entrar|conta|cadastro|foto|senha/i,'Fluxo Quero trabalhar não abriu');
    await closeModal();

    // O botão de login desktop fica oculto no viewport móvel; chamamos o mesmo roteador
    // programaticamente para testar a ação sem exigir visibilidade CSS.
    const loginCalled=await page.evaluate(()=>window.IntegraTrampoUICoreV8.callLatest('loginModal'));
    assert.equal(loginCalled,true,'loginModal não está disponível');
    await page.waitForFunction(()=>document.getElementById('modalRoot')?.innerText.trim().length>0,{timeout:5000});
    assert.match(await modalText(),/entrar|acessar|conta|senha/i,'Login não abriu');
    await closeModal();

    // Filtros/limpar devem ser acionáveis.
    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('vagas'));
    await page.locator('#jobQuery').fill('chapeiro');
    await page.locator('#clearJobs').click();
    assert.equal(await page.locator('#jobQuery').inputValue(),'','Limpar vagas não limpou a busca');

    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('profissionais'));
    await page.locator('#proQuery').fill('garçom');
    await page.locator('#clearPros').click();
    assert.equal(await page.locator('#proQuery').inputValue(),'','Limpar profissionais não limpou a busca');

    // Categorias da página inicial devem navegar sem lançar erro.
    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));
    const categoryButtons=page.locator('#categoryGrid button');
    const categories=await categoryButtons.count();
    assert.ok(categories>=10,`Catálogo de áreas incompleto: apenas ${categories}`);
    for(let i=0;i<Math.min(categories,5);i++){
      await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));
      await categoryButtons.nth(i).click();
      assert.equal(await active('vagas'),true,`Categoria ${i+1} não abriu Vagas`);
    }

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
