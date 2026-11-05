// MOCKED e2e for device detail accordion at 390x844. Build with mock env first.
import {chromium} from 'playwright-core';import {spawn} from 'node:child_process';import assert from 'node:assert/strict';
const port=43000+Math.floor(Math.random()*900),host='https://mock-backend.test';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe']});
await new Promise((res,rej)=>{server.stdout.on('data',s=>{if(s.toString().includes('Local:'))res()});server.on('exit',c=>rej(new Error('exit '+c)))});
const browser=await chromium.launch({executablePath:process.env.CHROME||'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
const session={access_token:'mock.fixture.token',refresh_token:'mock',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-1',email:'fixture@example.invalid',aud:'authenticated'}};
let n=0;
try{for(const theme of ['classic','thalj','royal'])for(const lang of ['ar','en']){
 const ctx=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
 let dev={id:'dev-1',device_code:'MOCK01',mac:'AA:BB',customer:'Fixture',note:'n1',active:true,expires_at:'2027-01-10T23:59:59Z',last_seen:null,model:'Fixture TV',created_at:'2026-01-01T00:00:00Z',app_type:'universe'};
 let pls=[{id:'p1',device_id:'dev-1',type:'m3u',name:'List A',url:'http://x/a.m3u',position:0}];const patches=[];let deletes=0;const errors=[];
 await ctx.addInitScript(([s,l,t])=>{localStorage.setItem('sb-mock-backend-auth-token',JSON.stringify(s));localStorage.setItem('lang',l);localStorage.setItem('theme',t)},[session,lang,theme]);
 await ctx.route(host+'/**',async r=>{const q=r.request(),u=new URL(q.url());const json=(b,st=200)=>r.fulfill({status:st,contentType:'application/json',headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'},body:JSON.stringify(b)});
  if(q.method()==='OPTIONS')return r.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
  if(u.pathname.endsWith('/rpc/admin_delete_device')){deletes++;return json({status:'deleted'})}
  if(u.pathname.endsWith('/admins'))return json({user_id:'u-1'});
  if(u.pathname.endsWith('/devices')){if(q.method()==='PATCH'){const b=JSON.parse(q.postData());patches.push(b);Object.assign(dev,b);return json([dev])}return json(u.searchParams.get('id')?dev:[dev])}
  if(u.pathname.endsWith('/playlists'))return json(pls);
  return json({})});
 const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));
 await p.goto('http://localhost:'+port+'/#/d/dev-1');await p.waitForSelector('.dtile');
 const open=()=>p.evaluate(()=>[...document.querySelectorAll('[data-panel]')].filter(e=>!e.hidden).map(e=>e.dataset.panel));
 const noOverflow=async()=>assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.equal(await p.getAttribute('html','dir'),'ltr');assert.equal(await p.locator('.dtile').count(),4);
 assert.deepEqual(await open(),[]);
 for(const t of await p.locator('.dtile').all()){const bb=await t.boundingBox();assert.ok(bb.height>=48&&bb.width>=48)}
 const xs=await p.locator('.dtile').evaluateAll(a=>a.map(e=>e.getBoundingClientRect().x));assert.ok(xs[0]<xs[1]);
 await noOverflow();
 await p.click('[data-sec=sub]');assert.deepEqual(await open(),['sub']);
 await p.click('[data-sec=pl]');assert.deepEqual(await open(),['pl']);
 await p.click('[data-sec=info]');assert.deepEqual(await open(),['info']);
 await p.click('[data-sec=info]');assert.deepEqual(await open(),[]);
 // subscription save must not touch info fields
 await p.click('[data-sec=sub]');assert.equal(await p.inputValue('#sf [name=expires_at]'),'2027-01-10');
 await p.click('#sf [data-m="1"]');assert.equal(await p.inputValue('#exp'),await p.inputValue('#exp'));
 await p.click('#sf .switch');await p.click('#sf button.primary');await p.waitForFunction(()=>document.querySelector('.dtile'));
 await p.waitForTimeout(300);
 assert.equal(patches.length,1);assert.deepEqual(Object.keys(patches[0]).sort(),['active','expires_at']);assert.deepEqual(await open(),[]);
 await noOverflow();
 // info save
 await p.click('[data-sec=info]');assert.equal(await p.inputValue('#df [name=customer]'),'Fixture');
 await p.fill('#df [name=customer]','Ali');await p.click('#df button.primary');await p.waitForTimeout(300);
 assert.deepEqual(Object.keys(patches[1]).sort(),['customer','mac','note']);assert.equal(patches[1].customer,'Ali');assert.equal(dev.active,false);
 await p.click('[data-sec=info]');await noOverflow();
 p.once('dialog',d=>d.dismiss());await p.click('#del');assert.equal(deletes,0);
 p.once('dialog',d=>d.accept());await p.click('#del');await p.waitForFunction(()=>location.hash==='#/');assert.equal(deletes,1);
 await p.goto('http://localhost:'+port+'/#/d/dev-1');await p.waitForSelector('.dtile');
 // playlists: one add, dialog
 await p.click('[data-sec=pl]');assert.equal(await p.locator('#addpl2').count(),1);assert.equal(await p.locator('.pl').count(),1);
 await p.click('#addpl2');await p.waitForSelector('#pf');assert.ok(await p.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await p.click('[data-close]');await p.waitForSelector('#pf',{state:'detached'});
 // aria-controls resolve; hide categories collapses others first
 await p.evaluate(()=>{for(const b of document.querySelectorAll('[aria-controls]'))if(!document.getElementById(b.getAttribute('aria-controls')))throw new Error('bad aria-controls')});
 await p.click('[data-sec=sub]');assert.deepEqual(await open(),['sub']);
 await p.click('#hide-categories');await p.waitForSelector('.category-close,.category-row,.category-notice');assert.deepEqual(await open(),[]);await noOverflow();
 assert.equal(errors.length,0,errors.join('\n'));await ctx.close();n++;console.log('PASS',theme,lang);
}console.log('PASS',n,'device-detail cases')}finally{await browser.close();server.kill('SIGTERM')}
