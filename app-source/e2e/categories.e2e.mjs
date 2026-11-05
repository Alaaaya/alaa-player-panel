import {chromium} from 'playwright-core';
import {spawn} from 'node:child_process';
import {once} from 'node:events';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const port=44000+Math.floor(Math.random()*1500),host='https://mock-backend.test',proxy='https://mock-categories.test';
const OUT='/home/kit/tmp/panel/categories-preview';fs.mkdirSync(OUT,{recursive:true});
const server=spawn('npx',['vite','preview','--port',String(port),'--strictPort'],{stdio:['ignore','pipe','pipe'],detached:true});
await new Promise((resolve,reject)=>{server.stdout.on('data',d=>{if(d.toString().includes('Local:'))resolve();});server.on('error',reject);});
const browser=await chromium.launch({executablePath:'/opt/hako/bin/google-chrome',args:['--no-sandbox']});
const checks=[];
try{
const context=await browser.newContext({viewport:{width:390,height:844},reducedMotion:'reduce'});
const session={access_token:'fixture',refresh_token:'fixture',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-1',email:'fixture@example.invalid',aud:'authenticated'}};
await context.addInitScript(s=>{localStorage.setItem('lang','ar');localStorage.setItem('theme','classic');localStorage.setItem('bgphoto','sunset');localStorage.setItem('sb-mock-backend-auth-token',JSON.stringify(s));},session);
const device={id:'00000000-0000-0000-0000-000000000001',device_code:'A1B2C3D4E5F6',model:'Living Room TV',customer:'تلفزيون الصالون',active:true,app_type:'universe',created_at:new Date().toISOString(),playlists:[{count:1}]};
const playlist={id:'00000000-0000-0000-0000-000000000002',device_id:device.id,name:'اشتراك البيت',type:'xtream',server:'https://provider.invalid',username:'dummy-user',password:'dummy-password'};
const providerGeneration='00000000-0000-0000-0000-000000000099';
const states=new Map(), writes=[];let failSave=false,empty=false,failLoad=false,delayLoad=0,delaySave=100,holdNextLive=false,releaseHeldLive=null,heldLiveStarted=null;
const stateKey=(pl,m,id)=>JSON.stringify([pl,m,id]);
function settings(){const hidden={live:[],vod:[],series:[]},versions={live:{},vod:{},series:{}};for(const [key,val]of states){const [pl,m,id]=JSON.parse(key);if(pl!==playlist.id)continue;if(val.hidden)hidden[m].push(id);versions[m][id]=val.version;}return {hidden_category_ids:hidden,category_versions:versions};}
states.set(stateKey(playlist.id,'live','4'),{hidden:true,version:1});
await context.route(host+'/**',async route=>{
 const req=route.request(),url=new URL(req.url());const json=(body,status=200)=>route.fulfill({status,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(body)});
 if(req.method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
 if(url.pathname.includes('/admins'))return json({user_id:'u-1'});
 if(url.pathname.endsWith('/device_category_settings'))return json(settings());
 if(url.pathname.endsWith('/devices'))return json(url.searchParams.has('id')?device:[device]);
 if(url.pathname.endsWith('/playlists'))return json([playlist]);
 if(url.pathname.endsWith('/admin_set_category_hidden')){
   const body=req.postDataJSON();writes.push(body);await new Promise(r=>setTimeout(r,delaySave));
   if(failSave)return json({message:'fixture failed'},500);
   const key=stateKey(body.p_playlist_id,body.p_media_type,body.p_category_id),old=states.get(key)||{hidden:false,version:0};
   if(old.version!==body.p_expected_version)return json({status:'conflict',...old});
   const value={hidden:body.p_hidden,version:old.version+(old.hidden===body.p_hidden?0:1)};states.set(key,value);return json({status:'saved',...value});
 }
 return json({});
});
await context.route(proxy+'/**',async route=>{
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
 const {device_id,playlist_id,media_type}=route.request().postDataJSON();assert.equal(device_id,device.id);
 const capturedSettings=settings();
 if(holdNextLive&&media_type==='live'){holdNextLive=false;await new Promise(resolve=>{releaseHeldLive=resolve;heldLiveStarted?.();});}
 if(delayLoad)await new Promise(r=>setTimeout(r,delayLoad));
 const names={live:['قنوات عربية','رياضة · Sports','أخبار · News','أطفال · Kids'],vod:['أفلام عربية','أفلام أجنبية','وثائقيات','كلاسيك'],series:['مسلسلات عربية','مسلسلات تركية','مسلسلات أجنبية','أنمي']};
 await route.fulfill({status:failLoad?502:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({status:failLoad?'provider_unavailable':'ok',playlist_id,media_type,provider_generation:providerGeneration,...capturedSettings,categories:empty?[]:names[media_type].map((name,i)=>({id:String(i+1),name}))})});
});
const page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
const open=async()=>{await page.goto(`http://localhost:${port}/#/d/${device.id}`);await page.click('#hide-categories');await page.waitForSelector('.category-row');};
const shot=async name=>{await page.screenshot({path:OUT+'/'+name+'.png'});};
await open();assert.equal(await page.locator('.category-row').count(),4);assert.equal(await page.locator('.category-row').first().getAttribute('class'),'category-row is-hidden');
assert.deepEqual(await page.locator('[role=tab]').allTextContents(),['مباشر','أفلام','مسلسلات']);
assert.equal(await page.locator('.category-dialog').evaluate(el=>getComputedStyle(el).direction),'ltr');assert.equal(await page.locator('.category-eye').first().evaluate(el=>el.getBoundingClientRect().height),48);
assert.equal(await page.locator('.category-dialog').getByRole('button',{name:'حفظ',exact:true}).count(),0);checks.push('LTR tabs 48px eyes no save hidden rows top');await shot('mobile-390-live');
await page.locator('.category-eye').nth(1).focus();await page.locator('.category-eye').nth(1).click();assert.equal(await page.locator('.category-eye[aria-busy=true]').count(),1);assert.equal(await page.locator('.category-eye[aria-disabled=true]').count(),1);
await page.waitForSelector('.category-eye[aria-busy=true]',{state:'detached'});assert.equal(writes.length,1);assert.equal(await page.locator('.category-row.is-hidden').count(),2);assert.equal(await page.evaluate(()=>document.activeElement.className),'category-eye');checks.push('optimistic per-row save retains focus after sort');
assert.deepEqual(await page.locator('.category-chip').allTextContents(),['الكل','المخفية','الظاهرة']);
await page.click('[data-filter=hidden].category-chip');assert.equal(await page.locator('.category-row').count(),2);assert.equal(await page.locator('.category-row:not(.is-hidden)').count(),0);
await page.click('[data-filter=visible].category-chip');assert.equal(await page.locator('.category-row').count(),2);assert.equal(await page.locator('.category-row.is-hidden').count(),0);
await page.click('[data-filter=all].category-chip');await page.click('.category-hidden-link');assert.equal(await page.locator('.category-chip[aria-pressed=true]').getAttribute('data-filter'),'hidden');
assert.equal(await page.locator('.category-summary bdi').allTextContents().then(a=>a.join(',')),'2,2');
await page.click('[data-filter=all].category-chip');checks.push('filter chips and clickable hidden count');
// show all: cancel keeps state, accept unhides only this tab
let dlg=0;page.once('dialog',d=>{dlg++;d.dismiss();});const w0=writes.length;await page.click('.category-showall');assert.equal(dlg,1);assert.equal(writes.length,w0);assert.equal(await page.locator('.category-row.is-hidden').count(),2);checks.push('show all confirm cancel');
await page.click('[data-media=vod]');await page.waitForSelector('.category-row');await page.locator('.category-eye').first().click();await page.waitForSelector('.category-eye[aria-busy=true]',{state:'detached'});await page.click('[data-media=live]');await page.waitForSelector('.category-row');
page.once('dialog',d=>{dlg++;d.accept();});const w1=writes.length;await page.click('.category-showall');
await page.waitForFunction(()=>document.querySelector('.category-feedback').textContent.includes('تم إظهار'));
assert.equal(writes.length-w1,2);assert.ok(writes.slice(w1).every(x=>x.p_media_type==='live'&&x.p_hidden===false));assert.equal(await page.locator('.category-row.is-hidden').count(),0);assert.equal(await page.locator('.category-showall').isHidden(),true);
await page.click('[data-media=vod]');await page.waitForSelector('.category-row');assert.equal(await page.locator('.category-row.is-hidden').count(),1);
checks.push('show all unhides only active tab');
// re-hide for the remaining scenarios: partial failure of bulk
await page.click('[data-media=live]');await page.waitForSelector('.category-row');
for(const i of [0,1]){await page.locator('.category-eye').nth(i).click();await page.waitForSelector('.category-eye[aria-busy=true]',{state:'detached'});}
failSave=true;page.once('dialog',d=>d.accept());await page.click('.category-showall');await page.waitForFunction(()=>document.querySelector('.category-feedback').textContent.includes('ما انحفظ'));failSave=false;
assert.equal(await page.locator('.category-chip[aria-pressed=true]').getAttribute('data-filter'),'hidden');checks.push('bulk partial failure reported');
page.once('dialog',d=>d.accept());await page.click('.category-showall');await page.waitForFunction(()=>document.querySelector('.category-feedback').textContent.includes('تم إظهار'));
await page.click('[data-filter=all].category-chip');
states.set(stateKey(playlist.id,'live','4'),{hidden:true,version:states.get(stateKey(playlist.id,'live','4')).version});
await page.click('[data-media=vod]');await page.click('[data-media=live]');
await page.click('[data-media=vod]');await page.waitForFunction(()=>document.querySelector('.category-name')?.textContent==='أفلام عربية');assert.equal(await page.locator('.category-row.is-hidden').count(),1);await shot('mobile-390-movies');checks.push('overlap ID remains visible in other media');
await page.click('[data-media=live]');await page.fill('input[type=search]','Sport');assert.equal(await page.locator('.category-row').count(),1);await page.click('.category-eye');await page.waitForSelector('.category-eye[aria-busy=true]',{state:'detached'});assert.equal(await page.inputValue('input[type=search]'),'Sport');assert.equal(await page.locator('[data-media=live]').getAttribute('aria-selected'),'true');checks.push('preserves search and active tab across instant save');
await page.fill('input[type=search]','nothing matches');assert.equal(await page.locator('.category-row').count(),0);await shot('mobile-390-search-empty');checks.push('search empty');
await page.fill('input[type=search]','News');failSave=true;await page.click('.category-eye');await page.waitForFunction(()=>document.querySelector('.category-feedback').textContent.includes('ما تم'));assert.equal(await page.locator('.category-eye').getAttribute('aria-pressed'),'false');await shot('mobile-390-save-failure');checks.push('rollback after failed save');failSave=false;
await page.fill('input[type=search]','');await page.setViewportSize({width:1440,height:1000});await shot('desktop-1440-live');
{const c=await page.evaluate(async()=>{const el=document.getElementById('bgphoto');const u=(getComputedStyle(el).backgroundImage.match(/url\(["']?([^"')]+)/)||[])[1];const im=new Image();im.src=u;await im.decode();const s=document.querySelector('.category-summary');const rows=[...document.querySelectorAll('.category-row')];const hid=rows.filter(r=>r.querySelector('.category-eye[aria-pressed=true], .category-eye.off, .hidden')).length;return {u,w:im.naturalWidth,h:im.naturalHeight,vis:getComputedStyle(el).visibility,op:getComputedStyle(el).opacity,nums:[...s.querySelectorAll('bdi')].map(b=>b.textContent),rows:rows.length}});assert.match(c.u,/sunset/);assert.ok(c.w>100&&c.h>100);assert.equal(c.nums.length,2);assert.equal(+c.nums[0]+ +c.nums[1],c.rows);console.log(JSON.stringify(c));}
for(const theme of ['classic','cinema','arcade','aurora','royal','reseller','thalj']){
 await page.evaluate(th=>{document.documentElement.dataset.theme=th;localStorage.setItem('theme',th);},theme);
 assert.equal(await page.locator('.category-eye').first().evaluate(el=>el.getBoundingClientRect().height),48);
 assert.equal(await page.evaluate(()=>document.documentElement.dataset.bgo),'sunset');
 await shot('desktop-theme-'+theme);
 {const a=await page.evaluate(()=>{const al=c=>{const m=c.match(/rgba?\(([^)]+)\)/);if(!m)return 1;const p=m[1].split(/[ ,\/]+/);return p.length>3?+p[3]:1};const sc=document.querySelector('.category-scrim'),d=document.querySelector('.category-dialog');const bg=getComputedStyle(d).backgroundImage;return {scrim:al(getComputedStyle(sc).backgroundColor),dlgColor:al(getComputedStyle(d).backgroundColor),hasLayer:/gradient/.test(bg)}});assert.equal(a.scrim,1);assert.equal(a.dlgColor,1);}
 await page.setViewportSize({width:390,height:844});await shot('mobile-390-opaque-'+theme);await page.setViewportSize({width:1440,height:900});
}checks.push('all 7 themes preserve independent sunset background');
await page.setViewportSize({width:390,height:844});await page.click('.category-close');
assert.equal(await page.evaluate(()=>document.activeElement.id),'hide-categories');checks.push('close restores opener focus');
// Fresh modal for provider states and loaded-empty, without persisting mock data into app source.
delayLoad=600;await page.click('#hide-categories');await page.waitForFunction(()=>document.querySelector('.category-notice')?.textContent.includes('عم نحم'));await shot('mobile-390-loading');await page.waitForSelector('.category-row');delayLoad=0;
await page.click('.category-close');empty=true;await page.click('#hide-categories');await page.waitForFunction(()=>document.querySelector('.category-notice')?.textContent.includes('ما في فئات'));await shot('mobile-390-provider-empty');checks.push('loading and provider empty');
await page.click('.category-close');empty=false;failLoad=true;await page.click('#hide-categories');await page.waitForSelector('.category-retry');await shot('mobile-390-provider-failure');failLoad=false;await page.click('.category-retry');await page.waitForSelector('.category-row');checks.push('provider failure retry');
// Hold the oldest Live snapshot, save against a newer load, then release stale data.
await page.click('.category-close');
holdNextLive=true;const oldestStarted=new Promise(resolve=>{heldLiveStarted=resolve;});
await page.click('#hide-categories');await oldestStarted;
await page.click('[data-media=vod]');await page.waitForSelector('.category-row');
await page.click('[data-media=live]');await page.waitForFunction(()=>[...document.querySelectorAll('.category-name')].some(n=>n.textContent==='أخبار · News'));
await page.fill('input[type=search]','News');await page.click('.category-eye');
await page.waitForSelector('.category-eye[aria-busy=true]',{state:'detached'});
assert.equal(await page.locator('.category-eye').getAttribute('aria-pressed'),'true');
const oldResponse=page.waitForResponse(r=>r.url().startsWith(proxy)&&r.request().method()==='POST');releaseHeldLive();await oldResponse;
await page.click('[data-media=vod]');await page.click('[data-media=live]');
assert.equal(await page.locator('.category-eye').getAttribute('aria-pressed'),'true');
checks.push('superseded Live response cannot overwrite newer confirmed save/model/cache');
await page.fill('input[type=search]','');
await page.click('.category-close');playlist.type='m3u';await page.reload();await page.click('#hide-categories');await page.waitForFunction(()=>document.querySelector('.category-notice')?.textContent.includes('M3U'));await shot('mobile-390-m3u-unsupported');checks.push('M3U explicit unsupported, no fake IDs');
assert.deepEqual(errors,[]);checks.push('no browser errors');
fs.writeFileSync(OUT+'/ui-tests.json',JSON.stringify({passed:true,checks,writes:writes.map(w=>({device:w.p_device_id,playlist:w.p_playlist_id,media:w.p_media_type,id:w.p_category_id})),mock_data_only:true},null,2));console.log('PASS',checks.length,'browser scenarios; mocked backend only, no provider contacted');
}finally{await browser.close();try{process.kill(-server.pid)}catch{}}
