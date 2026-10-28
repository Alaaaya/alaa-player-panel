export const isHttpUrl = (s) => { try { const u = new URL(s); return (u.protocol === 'http:' || u.protocol === 'https:') && !!u.hostname; } catch { return false; } };
const clean = (s) => String(s ?? '').trim();
// returns { row } or { error: key, field }
export function validatePlaylist(f, deviceId) {
  const type = f.type === 'xtream' ? 'xtream' : 'm3u';
  const name = clean(f.name), epg = clean(f.epg_url);
  if (!name) return { error: 'errName', field: 'name' };
  if (epg && !isHttpUrl(epg)) return { error: 'errUrl', field: 'epg_url' };
  if (type === 'm3u') {
    const url = clean(f.url);
    if (!isHttpUrl(url)) return { error: 'errUrl', field: 'url' };
    return { row: { device_id: deviceId, name, type, url, server: null, username: null, password: null, epg_url: epg || null } };
  }
  const server = clean(f.server).replace(/\/+$/, '');
  const username = clean(f.username), password = clean(f.password);
  if (!isHttpUrl(server)) return { error: 'errUrl', field: 'server' };
  if (!username) return { error: 'errUser', field: 'username' };
  if (!password) return { error: 'errPass', field: 'password' };
  return { row: { device_id: deviceId, name, type, url: null, server, username, password, epg_url: epg || null } };
}
