import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const PORT=43000+Math.floor(Math.random()*1000), HOST='https://mock-backend.test';
const exe=process.env.CHROME||'/opt/hako/bin/google-chrome';
const OUT=process.env.OUT||'/home/kit/tmp/bgshots'; fs.mkdirSync(OUT,{recursive:true});
const srv=spawn('npx',['vite','preview','--port',String(PORT),'--strictPort'],{stdio:'ignore'});
await new Promise(r=>setTimeout(r,2500));
const b=await chromium.launch({executablePath:exe,args:['--no-sandbox']});
try{
const ctx=await b.newContext({viewport:{width:390,height:844}});
await ctx.route(HOST+'/**',async route=>{const u=new URL(route.request().url());const j=(x)=>route.fulfill({status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(x)});
 if(route.request().method()==='OPTIONS')return route.fulfill({status:204,headers:{'access-control-allow-origin':'*','access-control-allow-headers':'*','access-control-allow-methods':'*'}});
 if(u.pathname.includes('admins'))return j({user_id:'u-1'}); if(u.pathname.endsWith('/devices'))return j([]); return j({});});
const s={access_token:'m',refresh_token:'m',token_type:'bearer',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,user:{id:'u-1',email:'fixture@example.invalid',aud:'authenticated'}};
await ctx.addInitScript(([s])=>{if(!localStorage.getItem('lang'))localStorage.setItem('lang','ar');localStorage.setItem('sb-mock-backend-auth-token',JSON.stringify(s));},[s]);
const p=await ctx.newPage(); const errs=[]; p.on('pageerror',e=>errs.push(e.message));
await p.goto('http://localhost:'+PORT+'/#/settings'); await p.waitForSelector('.bgs');
const st=()=>p.evaluate(()=>({bg:document.getElementById('bgphoto')?.style.backgroundImage||null,bgo:document.documentElement.dataset.bgo||null,th:document.documentElement.dataset.theme}));
const shot=async(n)=>{await p.waitForTimeout(500);await p.screenshot({path:OUT+'/'+n+'.png'});};
await p.evaluate(()=>localStorage.setItem('theme','thalj')); await p.reload(); await p.waitForSelector('.bgs');
let x=await st(); assert.equal(x.bg,null); assert.equal(x.bgo,null); // thalj default untouched
await p.locator('.bgpick').nth(0).scrollIntoViewIfNeeded(); await shot('01-picker-thalj-default');
await p.click('[data-bg=none]'); x=await st(); assert.equal(x.bgo,'none'); assert.equal(x.bg,null); await shot('02-thalj-none');
await p.click('[data-bg=aurora]'); x=await st(); assert.match(x.bg,/aurora/);
for(const th of ['classic','cinema','arcade','royal','reseller','thalj']){await p.click('[data-th="'+th+'"]');x=await st();assert.equal(x.th,th);assert.match(x.bg,/aurora/);}
await p.reload(); await p.waitForSelector('.bgs'); x=await st(); assert.match(x.bg,/aurora/);
await p.click('[data-bg=""]'); x=await st(); assert.equal(x.bg,null); assert.equal(x.bgo,null);
const ex=[['classic','desert'],['arcade','forest'],['royal','sunset'],['reseller','galaxy']];
for(const [th,bg] of ex){await p.click('[data-th="'+th+'"]');await p.click('[data-bg="'+bg+'"]');x=await st();assert.match(x.bg,new RegExp(bg));await p.evaluate(()=>window.scrollTo(0,0));await shot('ex-settings-'+th+'-'+bg);await p.evaluate(()=>{location.hash='#/'});await p.waitForTimeout(600);await shot('ex-dashboard-'+th+'-'+bg);await p.goto('http://localhost:'+PORT+'/#/settings');await p.waitForSelector('.bgs');}
await p.locator('.bgs').scrollIntoViewIfNeeded(); await p.locator('.bgs').screenshot({path:OUT+'/picker-grid.png'});
assert.deepEqual(errs,[]); console.log('PASS');
}catch(e){console.log('FAIL',e.message);process.exitCode=1}finally{await b.close();srv.kill()}
