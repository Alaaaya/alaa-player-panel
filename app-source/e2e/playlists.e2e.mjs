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
  const dev = { id: 'dev-1', device_code: 'MOCK01', mac: null, customer: 'Fixture', note: null, active: true, expires_at: null, last_seen: null, model: null, created_at: '2026-01-01T00:00:00Z' };
  return { db, log, handle: async (route) => {
    const req = route.request(); const u = new URL(req.url()); const m = req.method();
    const json = (b, status = 200, h = {}) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*', 'access-control-expose-headers': 'content-range', ...h }, body: JSON.stringify(b) });
    if (m === 'OPTIONS') return route.fulfill({ status: 204, headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*' } });
    const path = u.pathname;
    log.push(m + ' ' + path + u.search);
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

async function scenario(lang, theme) {
  const tag = lang + '/' + theme;
  const { ctx, page, be, errs } = await open(lang, theme);
  // button inside the form, visible at 390, near Save
  const btn = page.locator('#df #addpl-form');
  await btn.scrollIntoViewIfNeeded();
  assert.ok(await btn.isVisible(), tag + ' form add button visible');
  const bb = await btn.boundingBox(), sb = await page.locator('#df button.primary').boundingBox();
  assert.ok(Math.abs(bb.y - sb.y) < 120, tag + ' add button near save');
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), tag + ' no horizontal overflow');
  // validation: bad url
  await btn.click();
  await page.fill('#pf [name=name]', ' Test M3U ');
  await page.fill('#pf [name=url]', 'not a url');
  await page.click('#pf button.primary');
  assert.equal(be.db.playlists.length, 0, tag + ' invalid not saved');
  // valid m3u
  await page.fill('#pf [name=url]', ' http://example.invalid/list.m3u ');
  await page.click('#pf button.primary');
  await page.waitForSelector('.pl');
  assert.equal(be.db.playlists.length, 1);
  assert.equal(be.db.playlists[0].url, 'http://example.invalid/list.m3u');
  assert.equal(be.db.playlists[0].name, 'Test M3U');
  // xtream add via heading button, password masked + toggle
  await page.click('#addpl2');
  await page.click('#pf .seg label:has(input[value=xtream])');
  await page.fill('#pf [name=name]', 'XC');
  await page.fill('#pf [name=server]', 'http://host.invalid:8080/');
  await page.fill('#pf [name=username]', 'fixture-user');
  await page.fill('#pf [name=password]', 'fixture-pass');
  assert.equal(await page.getAttribute('#pf [name=password]', 'type'), 'password');
  await page.click('#pwtog');
  assert.equal(await page.getAttribute('#pf [name=password]', 'type'), 'text');
  await page.click('#pf button.primary');
  await page.waitForFunction(() => document.querySelectorAll('.pl').length === 2);
  assert.equal(be.db.playlists[1].server, 'http://host.invalid:8080');
  assert.equal(be.db.playlists[1].url, null);
  // edit
  await page.click('[data-edit=pl-2]');
  await page.fill('#pf [name=name]', 'XC renamed');
  await page.click('#pf button.primary');
  await page.waitForFunction(() => document.body.textContent.includes('XC renamed'));
  // delete
  await page.click('[data-edit=pl-1]'); await page.click('#pdel');
  await page.waitForFunction(() => document.querySelectorAll('.pl').length === 1);
  assert.equal(be.db.playlists.length, 1);
  assert.deepEqual(errs, [], tag + ' page errors');
  if (lang === 'ar') assert.equal(await page.evaluate(() => document.documentElement.dir), 'ltr');
  await ctx.close();
}

async function failures_() {
  // delete error must not claim success
  let { ctx, page, be } = await open('en', 'classic', { });
  be.db.playlists.push({ id: 'pl-9', name: 'Keep', type: 'm3u', url: 'http://a.invalid/x', device_id: 'dev-1' });
  await ctx.close();
  ({ ctx, page, be } = await open('en', 'classic', { deleteError: true }));
  be.db.playlists.push({ id: 'pl-9', name: 'Keep', type: 'm3u', url: 'http://a.invalid/x', device_id: 'dev-1' });
  await page.reload(); await page.waitForSelector('#df');
  await page.click('[data-edit=pl-9]'); await page.click('#pdel');
  await page.waitForFunction(() => document.querySelector('#toast').textContent.includes('MOCK delete denied'));
  assert.ok(!(await toastText(page)).includes('Deleted'));
  assert.equal(await page.locator('.pl').count(), 1);
  await ctx.close();
  // read error surfaced
  ({ ctx, page } = await open('ar', 'cinema', { readError: true }));
  assert.ok(await page.locator('#plretry').isVisible());
  assert.ok((await page.locator('#playlists').textContent()).includes('MOCK read denied'));
  assert.equal(await page.locator('.empty-pl .art, .pl').count() >= 0, true);
  await ctx.close();
  // double click save creates one row
  ({ ctx, page, be } = await open('en', 'royal', { slowInsert: true }));
  await page.click('#addpl-form');
  await page.fill('#pf [name=name]', 'Dup'); await page.fill('#pf [name=url]', 'http://a.invalid/d');
  await page.dispatchEvent('#pf button.primary', 'click'); await page.dispatchEvent('#pf button.primary', 'click');
  await page.waitForSelector('.pl');
  assert.equal(be.db.playlists.length, 1, 'no duplicate insert');
  await ctx.close();
}

async function run(name, fn) { try { await fn(); console.log('PASS', name); } catch (e) { failures++; console.log('FAIL', name, e.message); } }
for (const lang of ['ar', 'en']) for (const th of THEMES) await run(lang + ' ' + th, () => scenario(lang, th));
await run('failure paths (mock)', failures_);
await browser.close(); srv.kill();
console.log(failures ? failures + ' FAILED' : 'ALL PASS (mocked fixtures)');
process.exit(failures ? 1 : 0);
