// Synthetic fixtures only. All backend calls are intercepted, no real activation.
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const port = 44000 + Math.floor(Math.random() * 2000);
const server = spawn('npx', ['vite', 'preview', '--port', String(port), '--strictPort'], {detached:true,stdio:['ignore','pipe','pipe']});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('exit', code => reject(new Error('Preview exited '+code)));
    server.stdout.on('data', data => {if(data.toString().includes('Local:')) resolve();});
    server.stderr.on('data', data => {if(data.toString().includes('Error')) reject(new Error('Preview failed'));});
  });
  browser = await chromium.launch({executablePath:process.env.CHROME || '/opt/hako/bin/google-chrome',args:['--no-sandbox']});
  const context = await browser.newContext({viewport:{width:390,height:844}});
  await context.addInitScript(() => {localStorage.setItem('lang','ar');localStorage.setItem('theme','classic');});
  let status='activated', rpcCalls=0, release;
  await context.route('https://*.supabase.co/**',async route => {
    if(route.request().method()==='OPTIONS') return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*'}});
    assert.ok(route.request().url().endsWith('/rpc/submit_subscription_request'),'public page only calls activation RPC');
    rpcCalls++;
    if(status==='deferred') await new Promise(resolve=>{release=resolve;});
    await route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify({status:status==='deferred'?'activated':status})});
  });
  const page=await context.newPage();
  page.setDefaultTimeout(7000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto('http://localhost:'+port);
  const fields={code:'A1B2 C3D4 E5F6',name:'Draft <fixture> اشتراك',server:'https://provider.example',username:'synthetic-user',password:'synthetic-<&"-password',url:'https://provider.example/list.m3u?token=fixture'};
  const field=name=>page.locator('#public-request [name="'+name+'"]');
  const values=()=>page.locator('#public-request').evaluate(form=>Object.fromEntries(new FormData(form)));
  const assertFields=async type=>assert.deepEqual(await values(),{...fields,type});
  async function fill(type) {
    await field('type').selectOption('xtream');
    for(const key of ['code','name','server','username','password'])await field(key).fill(fields[key]);
    await field('type').selectOption('m3u');
    await field('url').fill(fields.url);
    await field('type').selectOption(type);
  }
  async function toggle() {
    const previous=await page.locator('[data-lang]').textContent();
    await page.locator('[data-lang]').click();
    await page.waitForFunction(previous=>document.querySelector('[data-lang]').textContent!==previous,previous);
  }
  for(const type of ['xtream','m3u']) {
    await fill(type);
    await toggle();await assertFields(type);
    await toggle();await assertFields(type);
    assert.equal(await page.locator('#xtream-fields').evaluate(el=>el.hidden),type!=='xtream');
    assert.equal(await page.locator('#m3u-fields').evaluate(el=>el.hidden),type!=='m3u');
    await page.locator('[data-public-theme]').selectOption('thalj');
    await assertFields(type);
    await toggle();await assertFields(type);
    await toggle();await assertFields(type);
    await page.locator('[data-public-theme]').selectOption('classic');
  }
  // Autofill/programmatic edits can omit input events. Capture at rerender too.
  await field('password').evaluate((el,value)=>{el.value=value;},fields.password+'-autofill');
  await toggle();
  assert.equal(await field('password').inputValue(),fields.password+'-autofill');
  await field('type').selectOption('xtream');
  await field('password').fill(fields.password);
  await field('type').selectOption('m3u');
  console.log('PASS language, hidden fields and autofill');
  for(const outcome of ['rate_limited','not_eligible']) {
    status=outcome;
    console.log('checking synthetic outcome',outcome);
    await page.locator('#public-request button').click();
    await page.waitForFunction(()=>!document.querySelector('#public-request button').disabled);
    await toggle();await assertFields('m3u');
  }
  console.log('PASS error retention');
  status='activated';
  await page.locator('#public-request button').click();
  await page.waitForFunction(()=>document.querySelector('#public-request [name=code]').value==='');
  await toggle();await toggle();
  assert.deepEqual(await values(),{code:'',name:'',type:'xtream',server:'',username:'',password:'',url:''});
  // A successful in-flight submission must clear the replacement form and draft.
  console.log('PASS successful reset');
  await fill('xtream');status='deferred';
  await page.locator('#public-request button').click();
  await page.waitForFunction(()=>document.querySelector('#public-request button').disabled);
  await toggle();await assertFields('xtream');
  assert.equal(await page.locator('#public-request button').isDisabled(),true);
  await page.locator('#public-request').evaluate(form=>form.requestSubmit());
  assert.equal(rpcCalls,4);
  assert.equal(typeof release,'function');release();
  await page.waitForFunction(()=>document.querySelector('#public-request [name=code]').value==='');
  await toggle();await toggle();
  assert.deepEqual(await values(),{code:'',name:'',type:'xtream',server:'',username:'',password:'',url:''});
  assert.equal(rpcCalls,4);
  const storage=await page.evaluate(()=>JSON.stringify({local:{...localStorage},session:{...sessionStorage}}));
  for(const secret of [fields.username,fields.password,fields.url])assert.equal(storage.includes(secret),false);
  assert.deepEqual(errors,[]);
  console.log('PASS public draft AR/EN/AR, both types, hidden fields, password/autofill, theme controls, failure retention, success clearing, in-flight success, storage isolation; 4 mocked RPCs, 0 real submissions');
  await context.close();
} finally {
  await browser?.close();
  process.kill(-server.pid,'SIGTERM');
}
