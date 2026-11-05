import { Client } from 'undici';
import { Duplex } from 'node:stream';
import { Buffer } from 'node:buffer';
import ipaddr from 'ipaddr.js';
const fail = () => { throw new Error('provider_unavailable'); };
export function publicAddress(ip: string) { try { return ipaddr.process(ip).range()==='unicast'; } catch { return false; } }
function sameIP(a:string,b:string){try{return ipaddr.process(a).toNormalizedString()===ipaddr.process(b).toNormalizedString();}catch{return false;}}
export function providerURL(p:any,media:string){
 const action=({live:'get_live_categories',vod:'get_vod_categories',series:'get_series_categories'} as Record<string,string>)[media];
 if(!action||p.type!=='xtream')return fail();
 const u=new URL(p.server);
 if(!['http:','https:'].includes(u.protocol)||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!(u.protocol==='http:'?['','80','8080']:['','443','8443']).includes(u.port))return fail();
 u.pathname='/player_api.php';u.search=new URLSearchParams({username:p.username,password:p.password,action}).toString();return u;
}
// Undici owns all HTTP framing through its maintained llhttp parser. This adapter
// only bridges bytes with backpressure. It never parses status, headers or chunks.
export class DenoSocket extends Duplex {
 conn:Deno.Conn; reading=false;
 constructor(conn:Deno.Conn){super();this.conn=conn;}
 override _read(){if(this.reading)return;this.reading=true;(async()=>{try{while(!this.destroyed){const b=new Uint8Array(16384),n=await this.conn.read(b);if(n===null){this.push(null);break;}if(!this.push(Buffer.from(b.subarray(0,n))))break;}}catch{this.destroy(new Error('provider_unavailable'));}finally{this.reading=false;}})();}
 override _write(b:Uint8Array,_encoding:unknown,cb:(e?:Error|null)=>void){(async()=>{try{let offset=0;while(offset<b.length){const n=await this.conn.write(b.subarray(offset));if(n<=0)throw new Error();offset+=n;}cb();}catch{cb(new Error('provider_unavailable'));}})();}
 override _destroy(e:Error|null,cb:(e:Error|null)=>void){try{this.conn.close();}catch{}cb(e);}
 // Socket tuning is irrelevant to the already-connected Deno transport.
 setNoDelay(){return this;}setKeepAlive(){return this;}setTimeout(){return this;}
}
export async function resolvePublic(host:string,resolve=Deno.resolveDns){
 if(ipaddr.isValid(host)){if(!publicAddress(host))return fail();return host;}
 const records=await Promise.all((['A','AAAA'] as const).map(async type=>{try{return await resolve(host,type);}catch(e){if(e instanceof Deno.errors.NotFound)return [];throw e;}}));
 const all=records.flat();if(!all.length||all.some(ip=>!publicAddress(ip)))return fail();return all[0];
}
export async function openPinned(host:string,port:number,signal:AbortSignal,opts:any={}){
 const protocol=opts.protocol||'https:';
 if(!(protocol==='http:'?[80,8080]:protocol==='https:'?[443,8443]:[]).includes(port))return fail();
 const resolve=opts.resolve||Deno.resolveDns,connect=opts.connect||Deno.connect,startTls=opts.startTls||Deno.startTls;
 let tcp:any,tls:any,handedOff=false;
 const close=()=>{try{tls?.close();}catch{}try{tcp?.close();}catch{}};
 signal.throwIfAborted();signal.addEventListener('abort',close,{once:true});
 try{
  const pin=await resolvePublic(host,resolve);signal.throwIfAborted();
  tcp=await connect({hostname:pin,port});if(signal.aborted){close();signal.throwIfAborted();}
  if(!sameIP(tcp.remoteAddr.hostname,pin))return fail();
  // Cancellation may be observed while inspecting the acquired TCP peer.
  signal.throwIfAborted();
  if(protocol==='http:'){opts.proof?.({literalPeer:true,tlsVerified:false});handedOff=true;return tcp;}
  tls=await startTls(tcp,{hostname:opts.testIdentity||host,alpnProtocols:['http/1.1']});
  if(signal.aborted){close();signal.throwIfAborted();}
  await tls.handshake();if(signal.aborted){close();signal.throwIfAborted();}
  if(!sameIP(tls.remoteAddr.hostname,pin))return fail();
  opts.proof?.({literalPeer:true,tlsVerified:true});
  handedOff=true;return tls;
 }catch{ return fail(); }finally{
  // Keep cancellation attached across the return-to-Duplex ownership window.
  // The enclosing request always aborts in finally, then destroys its socket.
  if(!handedOff){close();signal.removeEventListener('abort',close);}
 }
}
export async function requestPinned(url:URL,{timeout=8000,maxBytes=2097152,transportOptions={}}:any={}){
 if(!['http:','https:'].includes(url.protocol)||!(url.protocol==='http:'?['','80','8080']:['','443','8443']).includes(url.port)||url.username||url.password)return fail();
 const controller=new AbortController();let client:Client|undefined;let socket:DenoSocket|undefined;
 let timer:any;const deadline=new Promise<never>((_,reject)=>{timer=setTimeout(()=>{controller.abort();socket?.destroy();client?.destroy().catch(()=>{});reject(new Error('provider_unavailable'));},timeout);});
 const run=async()=>{
  const host=url.hostname.replace(/^\[|\]$/g,'');
  client=new Client(url.origin,{allowH2:false,pipelining:0,maxHeaderSize:16384,maxResponseSize:maxBytes,headersTimeout:timeout,bodyTimeout:timeout,
   connect:(_opts:any,cb:any)=>{(transportOptions.testOpen ? transportOptions.testOpen() : openPinned(host,Number(url.port||(url.protocol==='http:'?80:443)),controller.signal,{...transportOptions,protocol:url.protocol})).then((conn:Deno.Conn)=>{if(controller.signal.aborted){conn.close();cb(new Error('provider_unavailable'),null);return;}socket=new DenoSocket(conn);cb(null,socket);},()=>cb(new Error('provider_unavailable'),null));}});
  const res=await client.request({method:'GET',path:url.pathname+url.search,signal:controller.signal,headers:{accept:'application/json','accept-encoding':'identity'}});
  if(res.statusCode!==200||res.headers['content-encoding']&&res.headers['content-encoding']!=='identity'||!/^application\/(json|[^;]+\+json)\b/i.test(String(res.headers['content-type']||''))){res.body.destroy();return fail();}
  // No decompression at all. Reject compressed content, eliminating inflate bombs.
  const chunks:Uint8Array[]=[];let size=0;
  for await(const chunk of res.body){size+=chunk.length;if(size>maxBytes){res.body.destroy();return fail();}chunks.push(chunk);}
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
 };
 try{return await Promise.race([run(),deadline]);}catch{return fail();}finally{clearTimeout(timer);controller.abort();socket?.destroy();await client?.destroy().catch(()=>{});}
}
export async function pinnedProviderCategories(p:any,media:string){
 try{const data=await requestPinned(providerURL(p,media));if(!Array.isArray(data)||data.length>10000)return fail();const seen=new Set(),result=[];
 for(const row of data){if(!row||!['string','number'].includes(typeof row.category_id)||typeof row.category_name!=='string')return fail();const id=String(row.category_id);if(!/^[0-9]{1,64}$/.test(id)||!row.category_name.trim()||row.category_name.length>300)return fail();if(!seen.has(id)){seen.add(id);result.push({id,name:row.category_name});}}
 return result;}catch{return fail();}
}
