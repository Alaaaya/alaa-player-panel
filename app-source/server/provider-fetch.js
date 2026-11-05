import dns from 'node:dns/promises';
import https from 'node:https';
import net from 'node:net';
import ipaddr from 'ipaddr.js';

const fail = () => { throw new Error('provider_unavailable'); };
export function publicAddress(address) {
  try { const ip = ipaddr.process(address); return ip.range() === 'unicast'; } catch { return false; }
}
export function providerURL(playlist, media) {
  const action = {live:'get_live_categories',vod:'get_vod_categories',series:'get_series_categories'}[media];
  if (!action || playlist.type !== 'xtream') return fail();
  const url = new URL(playlist.server);
  // Fail closed. Plain HTTP exposes passwords; root-only URL prevents arbitrary stored paths.
  if(url.protocol !== 'https:' || url.username || url.password || url.search || url.hash || url.pathname !== '/' || !['','443','8443'].includes(url.port)) return fail();
  url.pathname = '/player_api.php';
  url.search = new URLSearchParams({username:playlist.username,password:playlist.password,action}).toString();
  return url;
}
export async function pinnedProviderCategories(playlist, media, {resolve = dns.lookup, request = https.request, timeout = 8000, maxBytes = 2*1024*1024} = {}) {
  const deadline = AbortSignal.timeout(timeout);
  try {
    const url = providerURL(playlist,media), hostname = url.hostname.replace(/^\[|\]$/g,'');
    const addresses = net.isIP(hostname) ? [{address:hostname,family:net.isIP(hostname)}] : await Promise.race([
      resolve(hostname,{all:true,verbatim:true}),
      new Promise((_,reject)=>deadline.addEventListener('abort',()=>reject(new Error('timeout')),{once:true})),
    ]);
    if(deadline.aborted || !addresses.length || addresses.some(a=>!publicAddress(a.address))) return fail();
    const pin = addresses[0];
    const data = await new Promise((done,reject) => {
      const req = request(url, {agent:false,signal:deadline,headers:{Accept:'application/json','Accept-Encoding':'identity'},
        lookup:(_host,opts,cb)=>cb(null,opts?.all?[pin]:pin.address, pin.family),
        maxHeaderSize:16384,
      }, res => {
        if(res.statusCode !== 200 || (res.headers['content-encoding'] && res.headers['content-encoding'] !== 'identity') || !/^application\/(json|[^;]+\+json)\b/i.test(res.headers['content-type']||'')) {
          res.destroy(); reject(new Error('provider_unavailable')); return;
        }
        let bytes = 0; const chunks = [];
        res.on('data',chunk=> { bytes += chunk.length; if(bytes>maxBytes) {res.destroy();reject(new Error('provider_unavailable'));}else chunks.push(chunk); });
        res.on('error',()=>reject(new Error('provider_unavailable')));
        res.on('end',()=>{try {done(JSON.parse(Buffer.concat(chunks).toString('utf8')));}catch{reject(new Error('provider_unavailable'));}});
      });
      req.on('error',()=>reject(new Error('provider_unavailable'))); req.end();
    });
    if(!Array.isArray(data) || data.length > 10000) return fail();
    const seen = new Set(), result = [];
    for(const row of data) {
      if(!row || !['string','number'].includes(typeof row.category_id) || typeof row.category_name !== 'string') return fail();
      const id = String(row.category_id);
      if(!/^[0-9]{1,64}$/.test(id) || !row.category_name.trim() || row.category_name.length>300) return fail();
      if(!seen.has(id)) {seen.add(id);result.push({id,name:row.category_name});}
    }
    return result;
  } catch { return fail(); }
}
