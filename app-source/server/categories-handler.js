import {createClient} from '@supabase/supabase-js';
import {pinnedProviderCategories} from './provider-fetch.js';
const UUID = /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
// Local admission is defense in depth; PostgreSQL grants durable shared admission.
export function createCategoryHandler({url,anonKey,origin,fetchCategories=pinnedProviderCategories,clientFactory=createClient,now=Date.now,gatewayToken}={}) {
  const budgets = new Map(); let inflight = 0;
  return async function handle(request) {
    const headers = {'Content-Type':'application/json','Cache-Control':'no-store','Vary':'Origin'};
    const respond = (status,body) => new Response(JSON.stringify(body),{status,headers});
    if(request.headers.get('origin') !== origin) return respond(403,{status:'forbidden'});
    headers['Access-Control-Allow-Origin']=origin;
    if(request.method === 'OPTIONS') return new Response(null,{status:204,headers:{...headers,'Access-Control-Allow-Methods':'POST, OPTIONS','Access-Control-Allow-Headers':'Authorization, Content-Type'}});
    if(request.method !== 'POST') return respond(405,{status:'invalid'});
    if(new URL(request.url).pathname !== '/api/admin/device-categories') return respond(404,{status:'not_found'});
    const token = /^Bearer ([^\s]{1,8192})$/.exec(request.headers.get('authorization')||'')?.[1];
    if(!token) return respond(401,{status:'unauthorized'});
    if(inflight>=8) return respond(429,{status:'rate_limited',retry_after:60});
    inflight++;
    let sb,lease;
    try {
      sb = clientFactory(url,anonKey,{global:{headers:{Authorization:'Bearer '+token},fetch:(input,init={})=>fetch(input,{...init,signal:AbortSignal.timeout(8000)})},auth:{persistSession:false,autoRefreshToken:false}});
      // getUser validates with the Auth server. Merely decoding a JWT is not validation.
      const {data:auth,error:authError} = await sb.auth.getUser(token);
      if(authError || !auth?.user?.id || auth.user.is_anonymous) return respond(401,{status:'unauthorized'});
      const {data:admin,error:adminError} = await sb.rpc('is_admin');
      if(adminError || admin !== true) return respond(403,{status:'forbidden'});
      const time = now(); for(const [k,b] of budgets) if(b.until<=time) budgets.delete(k);
      const key = auth.user.id, b = budgets.get(key);
      if((b?.hits||0)>=20 || (!b && budgets.size>=1000)) return respond(429,{status:'rate_limited',retry_after:60});
      budgets.set(key,{hits:(b?.hits||0)+1,until:b?.until||time+60000});
      if(!/^application\/json\b/i.test(request.headers.get('content-type')||'')) return respond(400,{status:'invalid'});
      const reader = request.body?.getReader(); let bytes=0; const chunks=[];
      if(!reader) return respond(400,{status:'invalid'});
      const readDeadline=AbortSignal.timeout(3000);
      const readTimeout=new Promise((_,reject)=>readDeadline.addEventListener('abort',()=>{reader.cancel().catch(()=>{});reject(new Error('timeout'));},{once:true}));
      for(;;) {const {done,value}=await Promise.race([reader.read(),readTimeout]); if(done) break; bytes+=value.length; if(bytes>1024){await reader.cancel();return respond(413,{status:'invalid'});}chunks.push(value);}
      let body; try {body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{return respond(400,{status:'invalid'});}
      if(!body || Object.keys(body).some(k=>!['device_id','playlist_id','media_type'].includes(k)) || !UUID.test(body.device_id) || !UUID.test(body.playlist_id) || !['live','vod','series'].includes(body.media_type)) return respond(400,{status:'invalid'});
      // Fail closed if durable limiter is missing/unavailable. Credential stays server-only.
      if(!gatewayToken) return respond(503,{status:'temporarily_unavailable'});
      const {data:admission,error:limitError}=await sb.rpc('category_gateway_acquire',{p_gateway_token:gatewayToken});
      if(limitError || !admission) return respond(503,{status:'temporarily_unavailable'});
      if(admission.status!=='admitted' || !UUID.test(admission.lease_id||'')) return respond(429,{status:'rate_limited',retry_after:60});
      lease=admission.lease_id;
      // No user-supplied server URL or credentials. RLS and BOTH IDs bind the playlist.
      const {data:playlist,error} = await sb.from('playlists').select('id,device_id,type,server,username,password,category_provider_generation').eq('id',body.playlist_id).eq('device_id',body.device_id).maybeSingle();
      if(error || !playlist) return respond(404,{status:'not_found'});
      if(playlist.type !== 'xtream') return respond(422,{status:'unsupported_m3u'});
      const categories = await fetchCategories(playlist,body.media_type);
      const {data:snapshot,error:snapshotError}=await sb.rpc('admin_get_category_snapshot',{p_device_id:body.device_id,p_playlist_id:body.playlist_id});
      if(snapshotError || !snapshot || snapshot.provider_generation!==playlist.category_provider_generation) return respond(409,{status:'provider_changed'});
      return respond(200,{status:'ok',playlist_id:body.playlist_id,media_type:body.media_type,...snapshot,categories});
    } catch { return respond(502,{status:'provider_unavailable'}); }
    finally {
      if(lease && sb) {try {await sb.rpc('category_gateway_release',{p_gateway_token:gatewayToken,p_lease_id:lease});}catch{ /* Lease expires in DB, never reset budgets on failures. */ }}
      inflight--;
    }
  };
}
