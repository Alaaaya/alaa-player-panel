// MOCKED integration test: the Supabase auth + REST endpoints are stubbed in-browser.
// Fixture only. No real backend, no real credentials. Build first: npm run test:e2e
import { chromium } from 'playwright-core';
import { spawn } from 'node:child_process';
import assert from 'node:assert/strict';

const PORT = 41000 + Math.floor(Math.random() * 2000);
const HOST = 'https://mock-backend.test';
const THEMES = ['classic', 'cinema', 'arcade', 'aurora', 'royal', 'reseller', 'thalj'];
const exe = process.env.CHROME || '/opt/hako/bin/google-chrome';

const srv = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], { stdio: 'ignore' });
await new Promise((r) => setTimeout(r, 2500));
const browser = await chromium.launch({ executablePath: exe, args: ['--no-sandbox'] });
let failures = 0;

function backend(opts = {}) {
  const db = { playlists: [], seq: 0 };
  const log = [];
  const dev = { app_type: 'universe', id: 'dev-1', device_code: 'MOCK01', mac: null, customer: 'Fixture', note: null, active: true, expires_at: null, last_seen: null, model: null, created_at: '2026-01-01T00:00:00Z' };
  return { db, log, handle: async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const json = (b, status = 200, h = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...h }, body: JSON.stringify(b) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const path = u.pathname;
    log.push(m + ' ' + path + u.search);
    if (path.endsWith('/rest/v1/rpc/admin_save_subscription')) {
      if (opts.saveError) return json({message:'mock failure'},500);
      const b=JSON.parse(req.postData());
      let row=db.playlists.find(p=>p.id===b.p_playlist_id);
      if(row) Object.assign(row,b.p_playlist);
      else {row={id:'pl-'+(++db.seq),...b.p_playlist};db.playlists.push(row);}
      return json({status:'saved',playlist_id:row.id});
    }
    if (path.includes('/rest/v1/admins')) return json({ user_id: 'u-1' });
    if (path.endsWith('/rest/v1/devices')) {
      const single = (req.headers()['accept'] || '').includes('vnd.pgrst.object');
      if (m === 'DELETE') return json([], 200, { 'content-range': '*/0' });
      return json(single ? dev : [{ ...dev, playlists: [{ count: db.playlists.length }] }]);
    }
    if (path.endsWith('/rest/v1/playlists')) {
      if (m === 'GET') { if (opts.readError) return json({ message: 'MOCK read denied' }, 500); return json(db.playlists); }
      if (m === 'POST') { const b = JSON.parse(req.postData()); const row = { id: 'pl-' + (++db.seq), created_at: new Date().toISOString(), ...b }; db.playlists.push(row); if (opts.slowInsert) await new Promise((r) => setTimeout(r, 600)); return json([row], 201); }
      if (m === 'PATCH') { const id = u.searchParams.get('id').replace('eq.', ''); const b = JSON.parse(req.postData()); Object.assign(db.playlists.find((p) => p.id === id), b); return json([], 204); }
      if (m === 'DELETE') {
        if (opts.deleteError) return json({ message: 'MOCK delete denied' }, 403);
        const id = u.searchParams.get('id').replace('eq.', ''); const n = db.playlists.length; db.playlists = db.playlists.filter((p) => p.id !== id);
        return json([], 200, { 'content-range': '*/' + (n - db.playlists.length) });
      }
    }
    return json({});
  } };
}

async function open(lang, theme, opts, vp = { width: 390, height: 844 }) {
  const ctx = await browser.newContext({ viewport: vp });
  const be = backend(opts);
  await ctx.route(HOST + '/**', be.handle);
  const session = { access_token: 'mock.fixture.token', refresh_token: 'mock', token_type: 'bearer', expires_in: 3600, expires_at: Math.floor(Date.now() / 1000) + 3600, user: { id: 'u-1', email: 'fixture@example.invalid', aud: 'authenticated' } };
  await ctx.addInitScript(([l, th, s]) => { localStorage.setItem('lang', l); localStorage.setItem('theme', th); localStorage.setItem('sb-mock-backend-auth-token', JSON.stringify(s)); window.confirm = () => true; }, [lang, theme, session]);
  const page = await ctx.newPage();
  const errs = []; page.on('pageerror', (e) => errs.push(e.message));
  await page.goto('http://localhost:' + PORT + '/#/d/dev-1');
  await page.waitForSelector('#df');
  return { ctx, page, be, errs };
}
const toastText = (page) => page.locator('#toast').textContent();


try {
for (const lang of ['ar','en']) for (const vp of [{width:1440,height:1000},{width:390,height:844}]) {
 const {ctx,page,be,errs}=await open(lang,'classic',{},vp);
 await page.goto('http://localhost:'+PORT+'/#/');
 await page.waitForSelector('#quick-code');
 assert.equal(await page.getAttribute('html','dir'),'ltr');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 await page.screenshot({path:'/home/kit/tmp/panel/'+lang+'-'+vp.width+'-code.png',fullPage:true});
 await page.fill('#quick-code','WRONGCODE'); await page.click('#lookup button');
 assert.ok((await page.locator('#quick-error').textContent()).length>0);
 await page.fill('#quick-code','mock01'); await page.click('#lookup button');
 await page.waitForSelector('#quick-form');
 assert.ok((await page.locator('.quick-found').textContent()).includes('universe'));
 await page.fill('#quick-form [name=server]','not a url');
 await page.click('#quick-form button');
 assert.equal(be.db.playlists.length,0);
 await page.fill('#quick-form [name=server]','https://provider.example:8080');
 await page.fill('#quick-form [name=username]','tv-subscription');
 await page.fill('#quick-form [name=password]','fixture-only');
 await page.screenshot({path:'/home/kit/tmp/panel/'+lang+'-'+vp.width+'-subscription.png',fullPage:true});
 await page.click('#quick-form button');
 await page.waitForFunction(()=>document.querySelector('#quick-result')?.textContent.includes('Saved')||document.querySelector('#quick-result')?.textContent.includes('تم الحفظ'));
 assert.equal(be.db.playlists.length,1);
 await page.waitForFunction(()=>document.querySelector('#quick-form [name=password]').value==='');
 await page.fill('#quick-form [name=password]','fixture-updated'); await page.click('#quick-form button');
 await page.waitForTimeout(300); assert.equal(be.db.playlists.length,1,'resave updates, not duplicate');
 await page.click('#quick-form .seg label:has(input[value=m3u])');
 await page.fill('#quick-form [name=url]','https://provider.example/list.m3u');
 await page.click('#quick-form button');await page.waitForTimeout(300);
 assert.equal(be.db.playlists.length,1);assert.equal(be.db.playlists[0].type,'m3u');
 assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
 assert.equal(errs.length,0,errs.join(','));
 console.log('PASS quick '+lang+' '+vp.width);
 await ctx.close();
}
const {ctx,page,be}=await open('ar','classic',{saveError:true});
await page.goto('http://localhost:'+PORT+'/#/');await page.waitForSelector('#quick-code');
await page.fill('#quick-code','MOCK01');await page.click('#lookup button');await page.waitForSelector('#quick-form');
await page.click('#quick-form .seg label:has(input[value=m3u])');await page.fill('#quick-form [name=url]','https://provider.example/list.m3u');await page.click('#quick-form button');
await page.waitForFunction(()=>document.querySelector('#quick-result')?.textContent.includes('ما تم الحفظ'));
assert.equal(be.db.playlists.length,0);assert.equal(await page.inputValue('#quick-form [name=url]'),'https://provider.example/list.m3u');
await ctx.close();console.log('PASS failed save preserves input');
} finally {await browser.close();srv.kill('SIGTERM');}
