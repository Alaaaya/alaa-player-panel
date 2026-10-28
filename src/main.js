import { createClient } from '@supabase/supabase-js';
import { t, getLang, setLang } from './i18n.js';
import { validatePlaylist } from './playlist.js';
import './style.css';
import './themes.css';
import './thalj.css';
import './quick.css';

const sb = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY);
const app = document.getElementById('app');
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const $ = (sel, root = document) => root.querySelector(sel);
let state = { devices: [], filter: 'all', q: '' };

function toast(msg, bad) {
  const el = $('#toast'); el.textContent = msg; el.className = 'show' + (bad ? ' bad' : '');
  clearTimeout(toast.t); toast.t = setTimeout(() => (el.className = ''), 2400);
}

const DAY = 864e5;
function status(d) {
  if (!d.active && !(d.playlists?.[0]?.count) && !d.expires_at) return 'pending';
  if (!d.active) return d.last_seen || d.customer || d.expires_at ? 'inactive' : 'pending';
  if (d.expires_at) {
    const left = new Date(d.expires_at) - Date.now();
    if (left < 0) return 'expired';
    if (left < 7 * DAY) return 'soon';
  }
  return 'active';
}
const fmtDate = (s) => (s ? new Date(s).toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : '');
function ago(s) {
  if (!s) return t('never');
  const rtf = new Intl.RelativeTimeFormat(getLang(), { numeric: 'auto' });
  const m = (new Date(s) - Date.now()) / 6e4;
  if (Math.abs(m) < 60) return rtf.format(Math.round(m), 'minute');
  if (Math.abs(m) < 1440) return rtf.format(Math.round(m / 60), 'hour');
  return rtf.format(Math.round(m / 1440), 'day');
}
const badge = (s) => `<span class="badge b-${s}"><i></i>${t(s)}</span>`;

/* ---------- shell ---------- */
const isRes = () => document.documentElement.dataset.theme === 'reseller';
const ICON = {
  dash: '<path d="M3 11l9-8 9 8v9a1 1 0 0 1-1 1h-5v-6h-6v6H4a1 1 0 0 1-1-1z"/>',
  dev: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  set: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  users: '<circle cx="9" cy="8" r="4"/><path d="M2 21a7 7 0 0 1 14 0M16 3.5a4 4 0 0 1 0 9M22 21a7 7 0 0 0-4-6.3"/>',
  ok: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 10l3 3 5-5M8 20h8"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  x: '<circle cx="12" cy="12" r="9"/><path d="M9 9l6 6M15 9l-6 6"/>',
  dots: '<circle cx="12" cy="5" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="12" cy="19" r="1.6"/>',
};
const ico = (k) => `<svg class="ic" viewBox="0 0 24 24" aria-hidden="true">${ICON[k]}</svg>`;
function shell(inner, active) {
  if (document.documentElement.dataset.theme === 'thalj') return `
    <header class="top frost-top">
      <a href="#/" class="mark"><span class="frost-symbol" aria-hidden="true">❄</span><span><b>${t('brand')}</b><small>THALJ · ${t('panel')}</small></span></a>
      <nav class="frost-nav" aria-label="${t('panel')}">
        <a href="#/" class="${!active ? 'on' : ''}">${ico('dash')}<span>${t('nav_dash')}</span></a>
        <a href="#/devices" class="${active === 'devices' ? 'on' : ''}">${ico('dev')}<span>${t('nav_devices')}</span></a>
        <a href="#/settings" class="${active === 'settings' ? 'on' : ''}">${ico('set')}<span>${t('settings')}</span></a>
      </nav>
      <button class="lang" data-lang>${getLang() === 'ar' ? 'EN' : 'ع'}</button>
    </header><main>${inner}</main>`;

  if (isRes()) return `
  <div class="rs-app">
    <aside class="rs-side">
      <a href="#/" class="rs-brand"><span class="glyph">◐</span><b>${t('brand')}</b></a>
      <nav class="rs-nav">
        <a href="#/" class="${!active ? 'on' : ''}">${ico('dash')}<span>${t('nav_dash')}</span></a>
        <a href="#/devices" class="${active === 'devices' ? 'on' : ''}">${ico('dev')}<span>${t('nav_devices')}</span></a>
        <a href="#/settings" class="${active === 'settings' ? 'on' : ''}">${ico('set')}<span>${t('settings')}</span></a>
      </nav>
      <button class="lang rs-lang" data-lang>${getLang() === 'ar' ? 'EN' : 'ع'}</button>
    </aside>
    <main class="rs-main">${inner}</main>
  </div>`;
  return `
  <header class="top">
    <a href="#/" class="mark"><span class="glyph">◐</span><span><b>${t('brand')}</b><small>${t('panel')}</small></span></a>
    <nav>
      <button class="lang" data-lang>${getLang() === 'ar' ? 'EN' : 'ع'}</button>
      <a href="#/settings" class="icon ${active === 'settings' ? 'on' : ''}" aria-label="${t('settings')}">⚙</a>
    </nav>
  </header>
  <main>${inner}</main>`;
}
document.addEventListener('click', (e) => {
  if (e.target.closest('[data-lang]')) { setLang(getLang() === 'ar' ? 'en' : 'ar'); route(); }
});

/* ---------- login ---------- */
function renderLogin(err) {
  app.innerHTML = `
  <section class="login">
    <div class="orb"></div>
    <label class="login-theme"><span>${t('theme')}</span><select aria-label="${t('theme')}" data-login-theme>${THEMES.map(th => `<option value="${th}" ${document.documentElement.dataset.theme === th ? 'selected' : ''}>${t('th_' + th)}</option>`).join('')}</select></label>
    <button class="lang floating" data-lang>${getLang() === 'ar' ? 'EN' : 'ع'}</button>
    <div class="login-card rise">
      <div class="frost-login-kicker">THALJ / CONTROL ROOM</div>
      <span class="glyph big">◐</span>
      <h1>${t('brand')}</h1>
      <p class="muted">${t('loginSub')}</p>
      <form id="lf">
        <label>${t('email')}<input name="email" type="email" autocomplete="username" required dir="ltr"></label>
        <label>${t('password')}<input name="password" type="password" autocomplete="current-password" required dir="ltr"></label>
        ${err ? `<p class="err">${esc(err)}</p>` : ''}
        <button class="btn primary wide">${t('login')}</button>
      </form>
    </div>
  </section>`;
  $('[data-login-theme]').onchange = e => { setTheme(e.target.value); renderLogin(); };
  $('#lf').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    e.target.querySelector('button').disabled = true;
    const { error } = await sb.auth.signInWithPassword({ email: f.get('email'), password: f.get('password') });
    if (error) return renderLogin(t('badLogin'));
    route();
  };
}

async function requireAdmin() {
  const { data: { session } } = await sb.auth.getSession();
  if (!session) return false;
  const { data } = await sb.from('admins').select('user_id').eq('user_id', session.user.id).maybeSingle();
  if (!data) { await sb.auth.signOut(); renderLogin(t('notAdmin')); return null; }
  return session;
}

/* ---------- dashboard ---------- */
async function loadDevices() {
  const { data, error } = await sb.from('devices').select('*, playlists(count)').order('created_at', { ascending: false });
  if (error) toast(error.message, true);
  state.devices = data || [];
}

const reduced = () => matchMedia('(prefers-reduced-motion: reduce)').matches;
function countUp(root = app) {
  root.querySelectorAll('[data-count]').forEach((el) => {
    const to = +el.dataset.count;
    if (reduced() || to === 0) { el.textContent = to; return; }
    const t0 = performance.now(), dur = 900 + Math.min(to, 50) * 12;
    const step = (now) => { const p = Math.min((now - t0) / dur, 1); el.textContent = Math.round(to * (1 - Math.pow(1 - p, 3))); if (p < 1) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  });
}
function greeting() {
  const h = new Date().getHours();
  return t(h < 5 ? 'gNight' : h < 12 ? 'gMorning' : h < 18 ? 'gDay' : 'gEvening');
}
const emptyArt = `<svg class="art" viewBox="0 0 200 150" aria-hidden="true">
  <defs><linearGradient id="eg" x1="0" x2="1" y1="0" y2="1"><stop offset="0" stop-color="var(--a1)"/><stop offset="1" stop-color="var(--a2)"/></linearGradient></defs>
  <line x1="78" y1="22" x2="96" y2="40" class="ant"/><line x1="124" y1="18" x2="104" y2="40" class="ant"/>
  <rect x="34" y="40" width="132" height="84" rx="14" fill="none" stroke="url(#eg)" stroke-width="4"/>
  <rect x="46" y="52" width="108" height="60" rx="6" class="scr"/>
  <g class="static"><rect x="52" y="60" width="30" height="3"/><rect x="90" y="70" width="44" height="3"/><rect x="60" y="82" width="22" height="3"/><rect x="100" y="94" width="40" height="3"/><rect x="56" y="102" width="34" height="3"/></g>
  <path d="M86 70 q14 -10 28 0 M92 78 q8 -6 16 0" class="wave" fill="none"/><circle cx="100" cy="88" r="3" class="dot"/>
  <rect x="70" y="124" width="10" height="10" rx="2" class="leg"/><rect x="120" y="124" width="10" height="10" rx="2" class="leg"/></svg>`;

function devRow(d, i) {
  return `<a class="dev rise" style="--d:${Math.min(i, 14) * 45}ms" href="#/d/${d.id}">
    <span class="dev-glow"></span>
    <span class="dev-ico st-${d.st}">${(d.customer || d.device_code).trim().charAt(0).toUpperCase()}</span>
    <div class="dev-main">
      <span class="code" dir="ltr">${esc(d.device_code)}</span><span class="app-label">${d.app_type === 'universe' ? 'universe' : 'Alaa Player'}</span>
      <span class="who">${esc(d.customer || d.model || '—')}</span>
    </div>
    <div class="dev-meta">
      ${badge(d.st)}
      <span class="muted sm">${d.expires_at ? '⏳ ' + fmtDate(d.expires_at) : t('noExpiry')}</span>
      <span class="muted sm">◉ ${ago(d.last_seen)} · ▤ ${d.playlists?.[0]?.count ?? 0}</span>
    </div></a>`;
}
function renderList() {
  const q = state.q.toLowerCase();
  const list = state.ds.filter((d) => (state.filter === 'all' || d.st === state.filter || (state.filter === 'inactive' && d.st === 'pending')) &&
    (!q || [d.device_code, d.mac, d.customer, d.note].some((v) => (v || '').toLowerCase().includes(q))));
  $('#listbox').innerHTML = list.length ? list.map(devRow).join('')
    : `<div class="empty rise">${emptyArt}<h3>${t(state.ds.length ? 'noMatch' : 'empty')}</h3><p class="muted">${t(state.ds.length ? 'noMatchSub' : 'emptySub')}</p></div>`;
  app.querySelectorAll('[data-f]').forEach((b) => b.classList.toggle('on', b.dataset.f === state.filter));
}
/* ---------- Reseller Pro dashboard ---------- */
function areaChart(vals, labels) {
  const W = 600, H = 220, P = { l: 30, r: 12, t: 14, b: 28 };
  const max = Math.max(4, ...vals), step = Math.ceil(max / 4);
  const top = step * 4, iw = W - P.l - P.r, ih = H - P.t - P.b;
  const pts = vals.map((v, i) => [P.l + (iw * i) / (vals.length - 1), P.t + ih - (v / top) * ih]);
  let d = `M${pts[0]}`;
  for (let i = 1; i < pts.length; i++) { const [x0, y0] = pts[i - 1], [x1, y1] = pts[i], cx = (x0 + x1) / 2; d += ` C${cx},${y0} ${cx},${y1} ${x1},${y1}`; }
  const grid = [0, 1, 2, 3, 4].map((k) => { const y = P.t + ih - (k / 4) * ih; return `<line x1="${P.l}" x2="${W - P.r}" y1="${y}" y2="${y}"/><text x="${P.l - 8}" y="${y + 4}" text-anchor="end">${k * step}</text>`; }).join('');
  return `<svg class="rs-area" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none" role="img">
    <defs><linearGradient id="ag" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#8b5cf6" stop-opacity=".55"/><stop offset="1" stop-color="#8b5cf6" stop-opacity="0"/></linearGradient></defs>
    <g class="grid">${grid}</g>
    <path class="fill" d="${d} L${pts.at(-1)[0]},${P.t + ih} L${P.l},${P.t + ih}Z"/>
    <path class="line" d="${d}" pathLength="1"/>
    ${pts.map(([x, y], i) => `<circle cx="${x}" cy="${y}" r="4.5"><title>${labels[i]}: ${vals[i]}</title></circle><text class="xl" x="${x}" y="${H - 6}" text-anchor="middle">${labels[i]}</text>`).join('')}
  </svg>`;
}
function donut(parts, total) {
  let off = 0;
  const segs = parts.filter((p) => p.n).map((p) => { const len = (p.n / total) * 100; const c = `<circle cx="60" cy="60" r="46" pathLength="100" stroke="${p.c}" stroke-dasharray="${Math.max(len - 1.2, .5)} ${100 - Math.max(len - 1.2, .5)}" stroke-dashoffset="${-off}"/>`; off += len; return c; }).join('');
  return `<div class="rs-donut"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="46" class="trk"/>${segs}</svg><div><b data-count="${total}">0</b><small>${t('nav_devices')}</small></div></div>`;
}
function renderReseller(devicesOnly) {
  const ds = state.devices.map((d) => ({ ...d, st: status(d) }));
  const lang = getLang(), loc = lang === 'ar' ? 'ar-EG' : 'en-GB';
  const now = Date.now(), wk = 7 * DAY;
  const c = (f) => ds.filter(f).length;
  const total = ds.length;
  const newWeek = c((d) => now - new Date(d.created_at) < wk), prevWeek = c((d) => { const a = now - new Date(d.created_at); return a >= wk && a < 2 * wk; });
  const active = c((d) => d.st === 'active' || d.st === 'soon');
  const soon = c((d) => d.st === 'soon');
  const expired = c((d) => d.st === 'expired');
  const expWeek = c((d) => d.st === 'expired' && now - new Date(d.expires_at) < wk);
  const disabled = total - active - expired;
  const trend = (n, txt, bad) => `<em class="tr ${n > 0 ? (bad ? 'bad' : 'up') : 'flat'}">${n > 0 ? '↑' : '•'} ${n > 0 ? '+' + n : n} <span>${txt}</span></em>`;
  const days = [...Array(7)].map((_, i) => { const d = new Date(); d.setHours(0, 0, 0, 0); d.setDate(d.getDate() - 6 + i); return d; });
  const perDay = days.map((d) => c((x) => { const t0 = new Date(x.created_at); return t0 >= d && t0 < new Date(+d + DAY); }));
  const labels = days.map((d) => d.toLocaleDateString(loc, { weekday: 'short' }));
  const cards = [
    ['users', 'c-blue', t('total'), total, trend(newWeek, t('thisWeek'))],
    ['ok', 'c-teal', t('active'), active, `<em class="tr flat"><span>${total ? Math.round((active / total) * 100) : 0}% ${t('ofAll')}</span></em>`],
    ['clock', 'c-pink', t('soon'), soon, `<em class="tr ${soon ? 'warn' : 'flat'}"><span>${t('within7')}</span></em>`],
    ['x', 'c-red', t('expired'), expired, trend(expWeek, t('thisWeek'), true)],
  ];
  const q = (state.q || '').toLowerCase();
  const rows = ds.filter((d) => !q || [d.device_code, d.mac, d.customer].some((v) => (v || '').toLowerCase().includes(q)));
  const shown = devicesOnly ? rows : rows.slice(0, 8);
  const table = `<section class="rs-card rs-table rise" style="--d:360ms">
      <div class="rs-th"><h3>${t(devicesOnly ? 'nav_devices' : 'recent')}</h3>
        <div class="rs-search">⌕<input id="q" placeholder="${t('search')}" value="${esc(state.q || '')}"></div></div>
      <div class="rs-scroll"><table><thead><tr><th>${t('deviceCode')}</th><th>${t('customer')}</th><th>${t('expiry')}</th><th>${t('status')}</th><th></th></tr></thead>
      <tbody>${shown.length ? shown.map((d) => `<tr data-id="${d.id}">
        <td class="mono" dir="ltr">${esc(d.device_code)} <span class="app-label">${d.app_type === 'universe' ? 'universe' : 'Alaa Player'}</span></td><td>${esc(d.customer || d.model || '—')}</td>
        <td>${d.expires_at ? fmtDate(d.expires_at) : '—'}</td><td><span class="pill p-${d.st}">${t(d.st)}</span></td>
        <td class="act"><button class="dots" data-menu="${d.id}" aria-label="actions">${ico('dots')}</button></td></tr>`).join('')
        : `<tr><td colspan="5" class="muted rs-none">${t(total ? 'noMatch' : 'empty')}</td></tr>`}</tbody></table></div>
    </section>`;
  app.innerHTML = shell(`
    <header class="rs-head rise">
      <div><h1>${t('welcome')}</h1><p class="muted">${t('welcomeSub')}</p></div>
      <div class="rs-date">${new Date().toLocaleDateString(loc, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}<small>${new Date().toLocaleTimeString(loc, { hour: '2-digit', minute: '2-digit' })}</small></div>
    </header>
    ${devicesOnly ? '' : `<section class="rs-stats">${cards.map(([i, cl, l, n, tr], k) => `
      <div class="rs-card rs-stat ${cl} rise" style="--d:${60 + k * 60}ms"><span class="rs-ico">${ico(i)}</span><div><small>${l}</small><b data-count="${n}">0</b>${tr}</div></div>`).join('')}</section>
    <section class="rs-row">
      <div class="rs-card rs-chart rise" style="--d:260ms"><div class="rs-th"><h3>${t('overview')}</h3><span class="rs-chip">${t('last7')}</span></div>
        ${areaChart(perDay, labels)}<p class="muted sm">${t('newDevices')}: ${newWeek}${prevWeek ? ` · ${t('prevWeek')}: ${prevWeek}` : ''}</p></div>
      <div class="rs-card rs-status rise" style="--d:320ms"><h3>${t('accStatus')}</h3>
        <div class="rs-dwrap">${donut([{ n: active, c: '#2ee6b6' }, { n: expired, c: '#ff5d7a' }, { n: disabled, c: '#f7b733' }], total)}
        <ul class="rs-leg"><li><i style="--c:#2ee6b6"></i>${t('active')}<b>${active}</b></li><li><i style="--c:#ff5d7a"></i>${t('expired')}<b>${expired}</b></li><li><i style="--c:#f7b733"></i>${t('disabled')}<b>${disabled}</b></li></ul></div></div>
    </section>`}
    ${table}
    <button class="fab" id="add" aria-label="${t('addDevice')}"><b>＋</b><span>${t('addDevice')}</span></button>
  `, devicesOnly ? 'devices' : undefined);
  countUp();
  const qi = $('#q');
  qi.oninput = () => { state.q = qi.value; const p = qi.selectionStart; renderReseller(devicesOnly); const n = $('#q'); n.focus(); n.setSelectionRange(p, p); };
  $('#add').onclick = addDeviceDialog;
  app.querySelectorAll('tbody tr[data-id]').forEach((tr) => (tr.onclick = (e) => { if (!e.target.closest('.dots')) location.hash = '#/d/' + tr.dataset.id; }));
  app.querySelectorAll('[data-menu]').forEach((b) => (b.onclick = (e) => {
    e.stopPropagation(); document.querySelector('.rs-menu')?.remove();
    const d = ds.find((x) => x.id === b.dataset.menu), r = b.getBoundingClientRect();
    const m = document.createElement('div'); m.className = 'rs-menu';
    m.innerHTML = `<button data-a="open">${t('open')}</button><button data-a="ext">${t('plus1m')}</button><button data-a="tog">${t(d.active ? 'deactivate' : 'activate')}</button><button class="danger" data-a="delete">${t('delete')}</button>`;
    m.style.top = `${r.bottom + 6}px`; m.style[lang === 'ar' ? 'left' : 'right'] = lang === 'ar' ? `${r.left}px` : `${innerWidth - r.right}px`;
    document.body.append(m);
    const off = () => { m.remove(); document.removeEventListener('click', off); }; setTimeout(() => document.addEventListener('click', off));
    m.onclick = async (ev) => {
      const a = ev.target.dataset.a; if (!a) return;
      if (a === 'open') return (location.hash = '#/d/' + d.id);
      if (a === 'delete') return deleteDevice(d, ev.target);
      let upd;
      if (a === 'ext') { const base = new Date(Math.max(Date.now(), d.expires_at ? +new Date(d.expires_at) : 0)); base.setMonth(base.getMonth() + 1); upd = { expires_at: base.toISOString(), active: true }; }
      else upd = { active: !d.active };
      const { error } = await sb.from('devices').update(upd).eq('id', d.id);
      toast(error ? error.message : t('saved')); await loadDevices(); renderReseller(devicesOnly);
    };
  }));
}

function renderDashboard() {
  const ds = (state.ds = state.devices.map((d) => ({ ...d, st: status(d) })));
  const count = (s) => ds.filter((d) => d.st === s).length;
  const stats = [['all', 'total', ds.length], ['active', 'active', count('active')], ['soon', 'soon', count('soon')], ['expired', 'expired', count('expired')]];
  const online = ds.filter((d) => d.last_seen && Date.now() - new Date(d.last_seen) < 15 * 6e4).length;
  const pct = ds.length ? Math.round((count('active') / ds.length) * 100) : 0;
  app.innerHTML = shell(`
    <section class="hero-head rise">
      <div class="hh-text">
        <p class="eyebrow"><span class="live-dot"></span>${online} ${t('onlineNow')}</p>
        <h1 class="hello">${greeting()}<span class="wave-hand">,</span> <em>${t('boss')}</em></h1>
        <p class="muted">${new Date().toLocaleDateString(getLang() === 'ar' ? 'ar-EG' : 'en-GB', { weekday: 'long', day: 'numeric', month: 'long' })}</p>
      </div>
      <div class="hh-meter" style="--p:${pct}">
        <svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="trk"/><circle cx="60" cy="60" r="52" class="val" pathLength="100" style="stroke-dashoffset:${100 - pct}"/></svg>
        <b><span data-count="${pct}">0</span>%</b><small>${t('active')}</small>
      </div>
    </section>
    <section class="stats">
      ${stats.map(([f, k, n], i) => `<button class="stat s-${f} ${state.filter === f ? 'on' : ''} rise" style="--d:${120 + i * 70}ms" data-f="${f}"><span class="shine"></span><b data-count="${n}">0</b><span>${t(k)}</span></button>`).join('')}
    </section>
    <div class="bar rise" style="--d:400ms">
      <div class="search"><span>⌕</span><input id="q" placeholder="${t('search')}" value="${esc(state.q)}"></div>
      <div class="chips">${['all', 'active', 'soon', 'expired', 'inactive'].map((f) => `<button class="chip ${state.filter === f ? 'on' : ''}" data-f="${f}">${t(f)}</button>`).join('')}</div>
    </div>
    <section class="list" id="listbox"></section>
    <button class="fab" id="add" aria-label="${t('addDevice')}"><b>＋</b><span>${t('addDevice')}</span></button>
  `);
  renderList(); countUp();
  app.querySelectorAll('[data-f]').forEach((b) => (b.onclick = () => { state.filter = b.dataset.f; renderList(); }));
  $('#q').oninput = (e) => { state.q = e.target.value; renderList(); };
  $('#add').onclick = addDeviceDialog;
}

function dialog(html, onMount) {
  const wrap = document.createElement('div');
  wrap.className = 'scrim';
  wrap.innerHTML = `<div class="sheet">${html}</div>`;
  document.body.appendChild(wrap);
  requestAnimationFrame(() => wrap.classList.add('open'));
  const close = () => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 250); };
  wrap.addEventListener('click', (e) => { if (e.target === wrap || e.target.closest('[data-close]')) close(); });
  onMount(wrap, close);
}

function addDeviceDialog() {
  dialog(`
    <h2>${t('addDevice')}</h2>
    <form id="af">
      <label>${t('deviceCode')}<input name="device_code" required dir="ltr" class="mono" autocapitalize="characters"></label>
      <label>${t('mac')}<input name="mac" dir="ltr" class="mono" placeholder="00:1A:79:..."></label>
      <label>${t('customer')}<input name="customer"></label>
      <label>${t('expiry')}<input name="expires_at" type="date"></label>
      <label class="switch"><input type="checkbox" name="active" checked><span></span>${t('activeToggle')}</label>
      <div class="row end"><button type="button" class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary">${t('save')}</button></div>
    </form>`, (w, close) => {
    $('#af', w).onsubmit = async (e) => {
      e.preventDefault();
      const f = new FormData(e.target);
      const code = f.get('device_code').trim().toUpperCase();
      if (!code) return toast(t('required'), true);
      const row = { device_code: code, mac: f.get('mac') || null, customer: f.get('customer') || null, active: !!f.get('active'),
        expires_at: f.get('expires_at') ? new Date(f.get('expires_at') + 'T23:59:59').toISOString() : null };
      const { data, error } = await sb.from('devices').insert(row).select().single();
      if (error) return toast(error.code === '23505' ? t('exists') : error.message, true);
      close(); toast(t('created')); location.hash = '#/d/' + data.id;
    };
  });
}

async function deleteDevice(d, button) {
  const warning = quickText(
    `حذف الجهاز ${d.device_code}؟ رح ينحذف ربطه ومفتاحه الخاص. القوائم وبيانات الاشتراك بتبقى محفوظة بدون جهاز. إعادة الربط بتحتاج تسجيل الجهاز من جديد.`,
    `Delete device ${d.device_code}? Its pairing and private token will be removed. Playlists and subscription details will be kept, unassigned. Reconnecting requires registering the TV again.`
  );
  if (!confirm(warning)) return;
  if (button) button.disabled = true;
  try {
    const { data, error } = await sb.rpc('admin_delete_device', { p_device_id: d.id });
    if (error || data?.status !== 'deleted') return toast(t('delFailed'), true);
    toast(t('deleted'));
    if (location.hash.startsWith('#/d/')) location.hash = '#/';
    else await route();
  } catch { toast(t('delFailed'), true); }
  finally { if (button) button.disabled = false; }
}

/* ---------- device detail ---------- */
async function renderDevice(id) {
  const [{ data: d, error }, { data: pls, error: plErr }] = await Promise.all([
    sb.from('devices').select('*').eq('id', id).single(),
    sb.from('playlists').select('*').eq('device_id', id).order('position').order('created_at'),
  ]);
  if (error || !d) { location.hash = '#/'; return; }
  const st = status(d);
  const daysLeft = d.expires_at ? Math.ceil((new Date(d.expires_at) - Date.now()) / DAY) : null;
  const dateVal = d.expires_at ? new Date(d.expires_at).toISOString().slice(0, 10) : '';
  app.innerHTML = shell(`
    <a href="#/" class="back">${getLang() === 'ar' ? '→' : '←'} ${t('back')}</a>
    <section class="hero rise">
      <div>
        <span class="code xl" dir="ltr">${esc(d.device_code)}</span><span class="app-label">${d.app_type === 'universe' ? 'universe' : 'Alaa Player'}</span>
        <div class="hero-meta">${badge(st)}<a class="btn primary sm" href="#playlists" id="addpl-top">＋ ${t('addPlaylist')}</a><span class="muted sm">◉ ${t('lastSeen')}: ${ago(d.last_seen)}</span></div>
      </div>
      ${daysLeft !== null ? `<div class="ring ${daysLeft < 0 ? 'neg' : daysLeft < 7 ? 'warn' : ''}"><svg viewBox="0 0 120 120"><circle cx="60" cy="60" r="52" class="trk"/><circle cx="60" cy="60" r="52" class="val" pathLength="100" style="stroke-dashoffset:${daysLeft < 0 ? 0 : 100 - Math.min(100, Math.round((daysLeft / 365) * 100))}"/></svg><b data-count="${Math.abs(daysLeft)}">0</b><small>${t('days')}${daysLeft >= 0 ? ' ' + t('daysLeft') : ''}</small></div>` : ''}
    </section>
    <form id="df" class="card rise" style="--d:80ms">
      <label class="switch"><input type="checkbox" name="active" ${d.active ? 'checked' : ''}><span></span>${t('activeToggle')}</label>
      <div class="grid2">
        <label>${t('customer')}<input name="customer" value="${esc(d.customer)}"></label>
        <label>${t('mac')}<input name="mac" value="${esc(d.mac)}" dir="ltr" class="mono"></label>
      </div>
      <label>${t('expiry')}
        <div class="row"><input name="expires_at" type="date" value="${dateVal}" id="exp">
        <div class="ext">${[['m1', 1], ['m3', 3], ['y1', 12]].map(([k, m]) => `<button type="button" class="chip" data-m="${m}">${t(k)}</button>`).join('')}</div></div>
      </label>
      <label>${t('note')}<textarea name="note" rows="2">${esc(d.note)}</textarea></label>
      ${d.model ? `<p class="muted sm">${t('model')}: ${esc(d.model)}</p>` : ''}
      <div class="row between"><button type="button" class="btn danger ghost" id="del">${t('delete')}</button><button class="btn primary">${t('save')}</button></div>
      <button type="button" class="btn ghost wide" id="addpl-form">＋ ${t('addPlaylist')} (M3U / Xtream)</button>
    </form>
    <section class="rise" style="--d:160ms" id="playlists">
      <div class="row between head"><h2>${t('playlists')}</h2><button class="btn primary sm" id="addpl2">＋ ${t('addPlaylist')}</button></div>
      <p class="muted sm">${t('plHelp')}</p>
      ${plErr ? `<div class="empty empty-pl"><p class="muted">${t('plLoadErr')}: ${esc(plErr.message)}</p><button class="btn ghost sm" id="plretry">${t('retry')}</button></div>` : ''}
      ${plErr ? '' : (pls || []).length ? pls.map((p) => `
        <div class="pl" data-id="${p.id}">
          <span class="ptype ${p.type}">${p.type === 'm3u' ? 'M3U' : 'XC'}</span>
          <div class="pl-body"><b>${esc(p.name)}</b><span class="muted sm mono" dir="ltr">${esc(p.type === 'm3u' ? p.url : `${p.server} · ${p.username}`)}</span></div>
          <button class="icon" data-edit="${p.id}" aria-label="edit">✎</button>
        </div>`).join('') : `<div class="empty empty-pl">${emptyArt}<p class="muted">${t('noPlaylists')}</p></div>`}
    </section>
  `);
  countUp();
  $('#exp').closest('label').querySelectorAll('[data-m]').forEach((b) => (b.onclick = () => {
    const base = $('#exp').value && new Date($('#exp').value) > new Date() ? new Date($('#exp').value) : new Date();
    base.setMonth(base.getMonth() + +b.dataset.m);
    $('#exp').value = base.toISOString().slice(0, 10);
    $('[name=active]').checked = true;
  }));
  $('#df').onsubmit = async (e) => {
    e.preventDefault();
    const f = new FormData(e.target);
    const { error } = await sb.from('devices').update({
      active: !!f.get('active'), customer: f.get('customer') || null, mac: f.get('mac') || null, note: f.get('note') || null,
      expires_at: f.get('expires_at') ? new Date(f.get('expires_at') + 'T23:59:59').toISOString() : null,
    }).eq('id', id);
    if (error) return toast(error.message, true);
    toast(t('saved')); renderDevice(id);
  };
  $('#del').onclick = (e) => deleteDevice(d, e.currentTarget);
  const openNew = () => plErr ? toast(t('plLoadErr'), true) : playlistDialog(id, null, (pls || []).length);
  $('#addpl2').onclick = openNew;
  $('#addpl-form').onclick = openNew;
  $('#addpl-top').onclick = (e) => { e.preventDefault(); $('#playlists').scrollIntoView({ behavior: 'smooth' }); openNew(); };
  if (plErr) $('#plretry').onclick = () => renderDevice(id);
  app.querySelectorAll('[data-edit]').forEach((b) => (b.onclick = () => playlistDialog(id, pls.find((p) => p.id === b.dataset.edit))));
}

function playlistDialog(deviceId, p, pos = 0) {
  const type = p?.type || 'm3u';
  dialog(`
    <h2>${p ? esc(p.name) : t('addPlaylist')}</h2>
    <form id="pf" novalidate>
      <div class="seg"><label><input type="radio" name="type" value="m3u" ${type === 'm3u' ? 'checked' : ''}><span>M3U</span></label><label><input type="radio" name="type" value="xtream" ${type === 'xtream' ? 'checked' : ''}><span>Xtream</span></label></div>
      <label>${t('name')}<input name="name" required value="${esc(p?.name || '')}"></label>
      <div class="t-m3u">
        <label>${t('url')}<input name="url" dir="ltr" class="mono" value="${esc(p?.url || '')}" placeholder="http://…/get.php?…"></label>
      </div>
      <div class="t-xtream">
        <label>${t('server')}<input name="server" dir="ltr" class="mono" value="${esc(p?.server || '')}" placeholder="http://host:8080"></label>
        <div class="grid2"><label>${t('username')}<input name="username" dir="ltr" value="${esc(p?.username || '')}" autocomplete="off"></label>
        <label>${t('password')}<span class="pwrow"><input name="password" type="password" dir="ltr" value="${esc(p?.password || '')}" autocomplete="new-password"><button type="button" class="btn ghost sm" id="pwtog">${t('show')}</button></span></label></div>
      </div>
      <label>${t('epg')}<input name="epg_url" dir="ltr" class="mono" value="${esc(p?.epg_url || '')}"></label>
      <div class="row between">${p ? `<button type="button" class="btn danger ghost" id="pdel">${t('delete')}</button>` : '<span></span>'}
        <div class="row"><button type="button" class="btn ghost" data-close>${t('cancel')}</button><button class="btn primary">${t('save')}</button></div></div>
    </form>`, (w, close) => {
    const form = $('#pf', w);
    const sync = () => { const ty = form.type.value; form.dataset.type = ty;
      $('[name=url]', form).required = ty === 'm3u'; ['server', 'username', 'password'].forEach((n) => ($(`[name=${n}]`, form).required = ty === 'xtream')); };
    form.querySelectorAll('[name=type]').forEach((r) => (r.onchange = sync)); sync();
    form.onsubmit = async (e) => {
      e.preventDefault();
      if (form.dataset.busy) return;
      const f = Object.fromEntries(new FormData(form));
      const v = validatePlaylist(f, deviceId);
      if (v.error) { const el = form.elements[v.field]; el?.focus(); return toast(t(v.error), true); }
      form.dataset.busy = '1'; const sub = form.querySelector('button.primary'); sub.disabled = true;
      const { error } = p ? await sb.from('playlists').update(v.row).eq('id', p.id) : await sb.from('playlists').insert({ ...v.row, position: pos });
      delete form.dataset.busy; sub.disabled = false;
      if (error) return toast(error.message, true);
      close(); toast(t('saved')); renderDevice(deviceId);
    };
    $('#pwtog', w).onclick = (e) => { const i = form.elements.password; const show = i.type === 'password'; i.type = show ? 'text' : 'password'; e.target.textContent = t(show ? 'hide' : 'show'); };
    if (p) $('#pdel', w).onclick = async () => {
      if (!confirm(t('confirmDelete'))) return;
      const b = $('#pdel', w); b.disabled = true;
      const { error, count } = await sb.from('playlists').delete({ count: 'exact' }).eq('id', p.id);
      b.disabled = false;
      if (error) return toast(error.message, true);
      if (!count) return toast(t('delFailed'), true);
      close(); toast(t('deleted')); renderDevice(deviceId);
    };
  });
}

const THEMES = ['classic', 'cinema', 'arcade', 'aurora', 'royal', 'reseller', 'thalj'];
const THEME_BG = { classic: '#0b0a09', cinema: '#0c0405', arcade: '#0a0216', aurora: '#03101a', royal: '#0a0b1f', reseller: '#0b0a1f', thalj: '#17384f' };
function setTheme(th) {
  if (th === 'saffron') th = 'classic';
  if (!THEMES.includes(th)) th = 'classic';
  document.documentElement.dataset.theme = th; localStorage.setItem('theme', th);
  document.querySelector('meta[name=theme-color]').content = THEME_BG[th];
}
setTheme(localStorage.getItem('theme'));

/* ---------- settings ---------- */
function renderSettings(session) {
  app.innerHTML = shell(`
    <a href="#/" class="back">${getLang() === 'ar' ? '→' : '←'} ${t('back')}</a>
    <h1 class="page rise">${t('settings')}</h1>
    <section class="card rise" style="--d:60ms">
      <h3>${t('language')}</h3>
      <div class="seg"><label><input type="radio" name="lg" value="ar" ${getLang() === 'ar' ? 'checked' : ''}><span>العربية</span></label><label><input type="radio" name="lg" value="en" ${getLang() === 'en' ? 'checked' : ''}><span>English</span></label></div>
    </section>
    <section class="card rise" style="--d:90ms">
      <h3>${t('theme')}</h3>
      <div class="themes">${THEMES.map((th) => `<button class="tpick ${document.documentElement.dataset.theme === th ? 'on' : ''}" data-th="${th}"><span class="tsw tsw-${th}"><i></i><i></i><i></i></span>${t('th_' + th)}</button>`).join('')}</div>
    </section>
    <section class="card rise" style="--d:120ms">
      <h3>${t('account')}</h3>
      <p class="muted mono" dir="ltr">${esc(session.user.email)}</p>
      <form id="pwf" class="row"><input name="pw" type="password" minlength="8" placeholder="${t('newPw')}" dir="ltr" required><button class="btn ghost">${t('changePw')}</button></form>
      <button class="btn danger ghost" id="out">${t('logout')}</button>
    </section>
    <section class="card rise" style="--d:180ms">
      <h3>${t('apiInfo')}</h3>
      <p class="muted">${t('apiNote')}</p>
      <code class="snippet" dir="ltr">POST /rest/v1/rpc/get_device_config_v2<br>{"p_device_code":"TV_CODE","p_device_token":"PRIVATE_64_HEX_TOKEN"}</code>
    </section>`, 'settings');
  app.querySelectorAll('[name=lg]').forEach((r) => (r.onchange = () => { setLang(r.value); route(); }));
  app.querySelectorAll('[data-th]').forEach((b) => (b.onclick = () => { setTheme(b.dataset.th); renderSettings(session); }));
  $('#out').onclick = async () => { await sb.auth.signOut(); route(); };
  $('#pwf').onsubmit = async (e) => {
    e.preventDefault();
    const { error } = await sb.auth.updateUser({ password: e.target.pw.value });
    error ? toast(error.message, true) : (toast(t('saved')), e.target.reset());
  };
}

/* Simple entry point. Advanced device management and all existing themes stay available. */
function polishQuickText() {
  app.querySelectorAll('.quick-head h1,.quick-head p,.quick-card p,.quick-card h2,.quick-bottom a,.quick-recent h2').forEach(el => el.dir = 'auto');
  app.querySelectorAll('.quick-card label').forEach(el => {
    [...el.childNodes].filter(n => n.nodeType === 3 && n.textContent.trim()).forEach(n => {
      const bdi = document.createElement('bdi'); bdi.dir = 'auto'; bdi.textContent = n.textContent; n.replaceWith(bdi);
    });
  });
}
const quickText = (ar, en) => getLang() === 'ar' ? ar : en;
let quickRefreshTimer;
function bindDeviceDeletes() {
  app.querySelectorAll('[data-delete-device]').forEach(button => {
    button.onclick = () => {
      const d = state.devices.find(d => d.id === button.dataset.deleteDevice);
      if (d) deleteDevice(d, button);
    };
  });
}
function renderQuick() {
  clearTimeout(quickRefreshTimer);
  app.innerHTML = shell(`
    <section class="quick-head"><div><p class="eyebrow">ALAA / DEVICE PANEL</p><h1>${quickText('أجهزتك وصلت. فعّل وابدأ.','Your TVs are here. Activate and start.')}</h1><p class="muted">${quickText('شغّل التطبيق على التلفزيون، والجهاز بيظهر هون لحاله.','Open the TV app. Your device appears here automatically.')}</p></div><a class="btn ghost" href="#/devices">${t('devices')} · ${state.devices.length}</a></section>
    <section class="pending-list"><h2 dir="auto">${quickText('بانتظار التفعيل','Awaiting activation')}</h2><p class="muted" dir="auto">${quickText('اضغط تفعيل وأضف الاشتراك. الكود للتعرّف على الجهاز فقط.','Press Activate and add a subscription. The code identifies the TV only.')}</p>${state.devices.filter(d => status(d)==='pending' && Date.now()-new Date(d.created_at)<DAY).map(d => `<article class="pending-device"><div><span class="app-label">${d.app_type==='universe'?'universe':'Alaa Player'}</span><h3 class="mono">${esc(d.device_code)}</h3><p class="muted" dir="auto">${esc(d.model||'TV')} · ${ago(d.created_at)}</p></div><div class="pending-actions"><button class="btn primary activate-pending" data-quick="${esc(d.device_code)}">${quickText('تفعيل','Activate')}</button><button class="btn danger ghost delete-device" data-delete-device="${d.id}">${t('delete')}</button></div></article>`).join('') || `<p class="muted" dir="auto">${quickText('ما في أجهزة جديدة. شغّل التطبيق لتظهر هون.','No new devices. Open the app on your TV.')}</p>`}</section>
    <details class="manual-code"><summary dir="auto">${quickText('بحث بكود جهاز قديم','Find an existing device by code')}</summary>
    <div class="quick-steps"><span class="on">01 ${t('deviceCode')}</span><span>02 ${quickText('الاشتراك','Subscription')}</span><span>03 ${t('save')}</span></div>
    <section class="card quick-card"><form id="lookup"><label for="quick-code">${quickText('الكود اللي ظاهر على التلفزيون','Code shown on your TV')}</label><div class="row"><input id="quick-code" name="code" dir="ltr" class="mono" placeholder="A1B2C3D4E5F6" maxlength="64" autocomplete="off" required><button class="btn primary">${quickText('فتح الجهاز','Open device')}</button></div><p class="muted sm">${quickText('شغّل التطبيق أولاً. الأجهزة الجديدة تظهر باسم universe.','Open the app first. New app devices are labeled universe.')}</p><p id="quick-error" class="err" role="alert"></p></form><div id="quick-sub"></div></section>
    </details><div id="pending-editor"></div>
    <div class="quick-bottom"><a href="#/devices">${quickText('إدارة الأجهزة القديمة والتفاصيل','Existing devices and advanced details')}</a><a href="#/settings">${t('settings')}</a></div>
    <section class="quick-recent"><h2>${t('recent')}</h2>${state.devices.slice(0,3).map(d => `<button class="quick-device" data-quick="${esc(d.device_code)}"><span class="mono">${esc(d.device_code)}</span><span class="app-label">${d.app_type === 'universe' ? 'universe' : 'Alaa Player'}</span><span class="muted">${esc(d.customer || d.model || '')}</span>${badge(status(d))}</button>`).join('')}</section>
  `);
  polishQuickText();
  bindDeviceDeletes();
  const lookup = $('#lookup');
  lookup.onsubmit = async e => {
    e.preventDefault();
    const code = lookup.elements.code.value.trim().toUpperCase();
    const d = state.devices.find(d => d.device_code === code);
    $('#quick-sub').innerHTML = '';
    $('#quick-error').textContent = d ? '' : quickText('ما لقينا الجهاز. تأكد من الكود وشغّل التطبيق ثم جرّب مرة ثانية.','Device not found. Check the code, open the app, then try again.');
    if (!d) return;
    document.querySelector('.manual-code').open = true;
    const { data: playlists, error } = await sb.from('playlists').select('*').eq('device_id', d.id).order('position').order('created_at');
    if (error) { $('#quick-error').textContent = t('plLoadErr'); return; }
    let pl = playlists?.[0];
    $('#quick-sub').innerHTML = `<div class="quick-found"><span class="app-label">${d.app_type === 'universe' ? 'universe' : 'Alaa Player'}</span><b class="mono">${esc(d.device_code)}</b>${badge(status(d))}<button class="btn danger ghost delete-device" data-delete-device="${d.id}">${t('delete')}</button></div><form id="quick-form"><h2>${quickText('أضف الاشتراك','Add subscription')}</h2><p class="muted sm">${quickText('الحفظ يفعّل الجهاز. القوائم الإضافية تبقى مثل ما هي.','Saving activates the TV. Other playlists remain unchanged.')}</p><div class="seg"><label><input type="radio" name="type" value="xtream" ${!pl || pl.type === 'xtream' ? 'checked' : ''}><span>Xtream</span></label><label><input type="radio" name="type" value="m3u" ${pl?.type === 'm3u' ? 'checked' : ''}><span>M3U</span></label></div><div class="t-xtream"><label>${t('server')}<input name="server" dir="ltr" value="${esc(pl?.server)}" placeholder="https://provider.example:8080"></label><div class="grid2"><label>${t('username')}<input name="username" dir="ltr" value="${esc(pl?.username)}" autocomplete="off"></label><label>${t('password')}<input name="password" type="password" dir="ltr" value="${esc(pl?.password)}" autocomplete="new-password"></label></div></div><div class="t-m3u"><label>${t('url')}<input name="url" dir="ltr" value="${esc(pl?.url)}" placeholder="https://provider.example/list.m3u"></label></div><button class="btn primary wide">${quickText('حفظ الاشتراك وتفعيل الجهاز','Save subscription and activate TV')}</button><p id="quick-result" role="status" aria-live="polite"></p></form>`;
    polishQuickText();
    bindDeviceDeletes();
    const form = $('#quick-form');
    const sync = () => {form.dataset.type = form.elements.type.value;};
    form.querySelectorAll('[name=type]').forEach(r => r.onchange = sync); sync();
    form.onsubmit = async event => {
      event.preventDefault();
      if(form.dataset.busy) return;
      const values = {...Object.fromEntries(new FormData(form)), name: pl?.name || 'Subscription'};
      const v = validatePlaylist(values,d.id);
      form.querySelectorAll('.field-error').forEach(el => el.remove());
      form.querySelectorAll('[aria-invalid]').forEach(el => {el.removeAttribute('aria-invalid');el.removeAttribute('aria-describedby');});
      $('#quick-result').textContent = '';
      if(v.error) {
        const field = form.elements[v.field];
        const message = document.createElement('p'); message.className = 'field-error'; message.dir = 'auto'; message.id = 'error-'+v.field; message.setAttribute('role','alert');
        if(v.error === 'errUrl' && getLang() === 'ar') {
          message.append('الرابط لازم يبدأ بـ ', Object.assign(document.createElement('bdi'),{dir:'ltr',textContent:'http'}), ' أو ', Object.assign(document.createElement('bdi'),{dir:'ltr',textContent:'https'}));
        } else message.textContent = t(v.error);
        field.insertAdjacentElement('afterend',message);field.setAttribute('aria-invalid','true');field.setAttribute('aria-describedby',message.id);field.focus();return;
      }
      form.dataset.busy = '1'; const btn = form.querySelector('button'); btn.disabled = true;
      const {data: saved, error} = await sb.rpc('admin_save_subscription', {p_device_id:d.id, p_playlist_id:pl?.id || null, p_playlist:v.row});
      delete form.dataset.busy; btn.disabled = false;
      $('#quick-result').textContent = error ? quickText('ما تم الحفظ. جرّب مرة ثانية.','Not saved. Please try again.') : quickText('تم الحفظ. افتح التطبيق على التلفزيون.','Saved. Open the app on your TV.');
      if(!error) { pl = {...v.row, id:saved.playlist_id}; await loadDevices(); form.querySelector('[name=password]').value = ''; form.querySelector('[name=url]').value = ''; }
    };
  };
  app.querySelectorAll('[data-quick]').forEach(b => b.onclick = () => {document.querySelector('.manual-code').open=true;lookup.elements.code.value = b.dataset.quick;lookup.requestSubmit();});
  quickRefreshTimer = setTimeout(() => {if(location.hash === '#/' || location.hash === '') {if(!$('#quick-form')) route();}},30000);
}

/* ---------- router ---------- */
async function route() {
  const session = await requireAdmin();
  if (session === null) return;
  if (!session) return renderLogin();
  const h = location.hash;
  if (h.startsWith('#/d/')) return renderDevice(h.slice(4));
  if (h === '#/settings') return renderSettings(session);
  await loadDevices();
  if (h !== '#/devices' && h !== '#/advanced') return renderQuick();
  if (isRes()) return renderReseller(h === '#/devices');
  renderDashboard();
  if (document.documentElement.dataset.theme === 'thalj' && h === '#/devices') $('.frost-nav a[href="#/devices"]').classList.add('on'), $('.frost-nav a[href="#/"]').classList.remove('on');
}
window.addEventListener('hashchange', route);
route();
