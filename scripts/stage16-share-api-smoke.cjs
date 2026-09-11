const assert=require('node:assert/strict');
const handler=require('../api/share.js');

const ID='123e4567-e89b-42d3-a456-426614174000';

function response(){
  return {
    statusCode:200,
    headers:{},
    body:'',
    setHeader(name,value){this.headers[String(name).toLowerCase()]=String(value)},
    end(body=''){this.body=String(body);return this}
  };
}

(async()=>{
  const calls=[];
  global.fetch=async url=>{
    const value=String(url);calls.push(value);
    if(value.includes('/it_public_professionals?'))return {ok:true,json:async()=>[{id:ID,display_name:'Profissional QA',role_title:'Eletricista',city:'Teodoro Sampaio',reference_daily:180,rating:4.9,review_count:7,photo_url:'https://cdn.example.test/pro.jpg'}]};
    if(value.includes('/it_opportunities?'))return {ok:true,json:async()=>[{id:ID,title:'Vaga QA',category:'Serviços',city:'Teodoro Sampaio',service_date:'2026-09-20',daily_rate:200,image_url:'https://cdn.example.test/job.jpg',company_id:ID}]};
    if(value.includes('/it_companies?'))return {ok:true,json:async()=>[{display_name:'Empresa QA'}]};
    return {ok:false,json:async()=>[]};
  };

  const pro=response();
  await handler({url:`/api/share?type=pro&id=${ID}&channel=whatsapp`,headers:{host:'integratrampo.example','x-forwarded-proto':'https'}},pro);
  assert.equal(pro.statusCode,200);
  assert.match(pro.headers['content-type'],/text\/html/);
  assert.match(pro.body,/Profissional QA \| IntegraTrampo/);
  assert.match(pro.body,/property="og:title"/);
  assert.match(pro.body,/property="og:image" content="https:\/\/cdn\.example\.test\/pro\.jpg"/);
  assert.match(pro.body,new RegExp(`profissional=${ID}`));
  assert.match(pro.body,/utm_source=whatsapp/);
  assert.match(calls[0],/it_public_professionals/);
  assert.match(calls[0],/is_published=eq\.true/);
  assert.doesNotMatch(calls[0],/whatsapp|email|phone|user_id/i);

  calls.length=0;
  const job=response();
  await handler({url:`/api/share?type=job&id=${ID}&channel=facebook`,headers:{host:'integratrampo.example','x-forwarded-proto':'https'}},job);
  assert.equal(job.statusCode,200);
  assert.match(job.body,/Vaga QA \| IntegraTrampo/);
  assert.match(job.body,/Empresa QA/);
  assert.match(job.body,new RegExp(`vaga=${ID}`));
  assert.match(job.body,/utm_source=facebook/);
  assert.match(calls[0],/it_opportunities/);
  assert.match(calls[0],/status=eq\.published/);
  assert.ok(calls.some(x=>/it_companies/.test(x)&&/is_published=eq\.true/.test(x)),'Empresa precisa ser lida apenas como publicada');
  assert.ok(calls.every(x=>!/whatsapp|email|phone|user_id/i.test(x)),'Preview não pode consultar campos privados');

  const invalid=response();
  await handler({url:'/api/share?type=pro&id=invalido',headers:{host:'integratrampo.example'}},invalid);
  assert.equal(invalid.statusCode,400);
  assert.match(invalid.body,/Link inválido/);

  console.log('STAGE16_SHARE_API_SMOKE_OK');
})().catch(err=>{console.error('STAGE16_SHARE_API_SMOKE_FAIL');console.error(err);process.exit(1)});
