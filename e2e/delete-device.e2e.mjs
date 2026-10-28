// UI contract tests with an isolated mock. Real database checks live in the private operator evidence.
import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import assert from 'node:assert/strict';
const port=42000+Math.floor(Math.random()*1000), host='https://mock-backend.test';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
await new Promise((resolve,reject)=>{server.stdout.on('data',s=>{if(s.toString().includes('Local:'))resolve()});server.on('exit',c=>reject(new Error('Preview exited '+c)))});
const browser=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
const session={access_token:'mock.fixture.token',refresh_token:'mock',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-1',email:'fixture@example.invalid',aud:'authenticated'}};
let cases=0;
try {
for(const theme of ['classic','cinema','arcade','aurora','royal','reseller','thalj']) for(const lang of ['ar','en']) for(const width of [390,1440]){
 const ctx=await browser.newContext({viewport:{width,height:844},reducedMotion:'reduce'});
 let ds=Array.from({length:5},(_,i)=>({id:'dev-'+i,device_code:'MOCK'+i,active:i===4,created_at:new Date().toISOString(),app_type:'universe',model:'Fixture TV',playlists:[{count:i===4?1:0}]}));
 let calls=0, mode='deleted';const errors=[];
 await ctx.addInitScript(([s,l,t])=>{localStorage.setItem('sb-mock-backend-auth-token',JSON.stringify(s));localStorage.setItem('lang',l);localStorage.setItem('theme',t)},[session,lang,theme]);
 await ctx.route(host+'/**',async r=>{
  const req=r.request(),u=new URL(req.url());const json=(b,status=200)=>r.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'},body:JSON.stringify(b)});
  if(req.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if(u.pathname.endsWith('/rpc/admin_delete_device')){calls++;const b=JSON.parse(req.postData());if(mode==='error')return json({message:'Forbidden'},403);if(mode==='deleted')ds=ds.filter(d=>d.id!==b.p_device_id);return json({status:mode,preserved_playlists:1})}
  if(u.pathname.endsWith('/admins'))return json({user_id:'u-1'});
  if(u.pathname.endsWith('/devices')){const id=u.searchParams.get('id')?.replace('eq.','');return json(id?ds.find(d=>d.id===id):ds)}
  if(u.pathname.endsWith('/playlists'))return json([]);
  return json({});
 });
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://localhost:'+port+'/#/');await p.waitForSelector('.pending-device');
 assert.equal(await p.getAttribute('html','dir'),'ltr');assert.equal(await p.locator('.pending-device .delete-device').count(),4);
 assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 if(width===390&&theme!=='reseller')assert.equal(await p.locator('.top').evaluate(e=>getComputedStyle(e).position),'relative');
 await p.locator('.manual-code summary').click();
 assert.ok(await p.evaluate(()=>{const a=document.querySelector('.manual-code summary').getBoundingClientRect(),b=document.querySelector('.quick-steps').getBoundingClientRect();return b.top>=a.bottom+8}));
 assert.equal(await p.locator('.quick-steps').evaluate(e=>getComputedStyle(e).position),'static');
 await p.evaluate(()=>window.scrollTo(0,0));
 if(theme==='classic'&&lang==='ar')await p.screenshot({path:'/home/kit/tmp/panel/delete-fix/mock-ar-'+width+'.png',fullPage:true});
 p.once('dialog',d=>{assert.ok(d.message().includes('MOCK0'));d.dismiss()});
 await p.locator('[data-delete-device="dev-0"]').click();assert.equal(calls,0);
 p.once('dialog',d=>d.accept());await p.locator('[data-delete-device="dev-0"]').click();await p.waitForFunction(()=>document.querySelectorAll('.pending-device').length===3);assert.equal(calls,1);
 // Active editor entry, cancel, failed response, not_found, then successful delete.
 await p.locator('.manual-code').evaluate(e=>e.open=true);await p.fill('#quick-code','MOCK4');await p.click('#lookup button');await p.waitForSelector('.quick-found .delete-device');
 for(const result of ['error','not_found']){mode=result;p.once('dialog',d=>d.accept());await p.click('.quick-found .delete-device');await p.waitForFunction(()=>document.querySelector('.quick-found .delete-device')?.disabled===false);assert.ok(ds.some(d=>d.id==='dev-4'));assert.ok(await p.locator('#toast').textContent());}
 mode='deleted';p.once('dialog',d=>d.accept());await p.click('.quick-found .delete-device');await p.waitForFunction(()=>!document.querySelector('.quick-found'));assert.ok(!ds.some(d=>d.id==='dev-4'));
 assert.equal(errors.length,0,errors.join('\n'));await ctx.close();cases++;console.log('PASS delete/layout',theme,lang,width);
}
console.log('PASS',cases,'delete/layout matrix cases');
}finally{await browser.close();server.kill('SIGTERM')}
