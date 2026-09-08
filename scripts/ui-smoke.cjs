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

    // Hero: ver oportunidades
    await page.getByRole('button',{name:/Ver oportunidades/i}).click();
    assert.equal(await active('vagas'),true,'Ver oportunidades não abriu a tela Vagas');

    // Navegação principal/móvel
    for(const id of ['home','profissionais','empresas','painel','operacao','vagas']){
      await page.evaluate(x=>document.querySelector(`[data-go="${x}"]`)?.click(),id);
      assert.equal(await active(id),true,`Navegação para ${id} falhou`);
    }

    await page.evaluate(()=>window.IntegraTrampoUICoreV8.navigate('home'));

    // Contratação precisa abrir modal, mesmo que camadas posteriores tenham substituído a função.
    await page.getByRole('button',{name:/Preciso contratar/i}).first().click();
    await page.waitForFunction(()=>document.getElementById('modalRoot')?.innerText.trim().length>0,{timeout:5000});
    assert.match(await page.locator('#modalRoot').innerText(),/contrat|empresa|necessidade/i,'Modal de contratação não abriu conteúdo válido');
    await closeModal();

    // Quero trabalhar pode abrir cadastro diretamente ou pedir login; ambos são fluxos válidos.
    await page.getByRole('button',{name:/Quero trabalhar/i}).first().click();
    await page.waitForFunction(()=>document.getElementById('modalRoot')?.innerText.trim().length>0,{timeout:5000});
    assert.match(await page.locator('#modalRoot').innerText(),/trabalhar|entrar|conta|cadastro|foto/i,'Fluxo Quero trabalhar não abriu');
    await closeModal();

    // Entrar precisa responder.
    await page.locator('#loginBtn').click();
    await page.waitForFunction(()=>document.getElementById('modalRoot')?.innerText.trim().length>0,{timeout:5000});
    assert.match(await page.locator('#modalRoot').innerText(),/entrar|acessar|conta|senha/i,'Login não abriu');
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

    // Dá tempo para as camadas assíncronas terminarem e roda o diagnóstico de handlers.
    await page.waitForTimeout(5000);
    const health=await page.evaluate(()=>window.IntegraTrampoUICoreV8.report());
    assert.equal(health.ok,true,`Diagnóstico da UI encontrou problemas: ${health.issues.join('; ')}`);
    assert.equal(pageErrors.length,0,`Erros JavaScript não tratados: ${pageErrors.join('\n---\n')}`);

    console.log('UI_SMOKE_OK');
    console.log(JSON.stringify(health,null,2));
  } finally {
    await browser.close();
  }
})().catch(err=>{console.error('UI_SMOKE_FAIL');console.error(err);process.exit(1)});
