import {requestPinned,publicAddress,resolvePublic,providerURL} from './provider.ts';
function assert(v:unknown){if(!v)throw new Error('assertion');}
async function rejects(fn:()=>Promise<unknown>){try{await fn();}catch{return;}throw new Error('expected rejection');}
// Real llhttp, real TLS loopback fixture. Test transport injection only, never
// exposed in the HTTP handler. Production resolver always denies loopback.
const cert=Deno.readTextFileSync('/home/kit/tmp/panel/edge-fixtures/cert.pem'),key=Deno.readTextFileSync('/home/kit/tmp/panel/edge-fixtures/key.pem');
async function fixture(response:string,opts:any={}){
 const listener=Deno.listenTls({hostname:'127.0.0.1',port:0,cert,key});
 const server=(async()=>{try{const c=await listener.accept();await c.read(new Uint8Array(4096));await c.write(new TextEncoder().encode(response));if(opts.hold)await new Promise(r=>setTimeout(r,opts.hold));c.close();}catch{}finally{listener.close();}})();
 const transportOptions={testOpen:async()=>{const tcp=await Deno.connect({hostname:'127.0.0.1',port:listener.addr.port});const c=await Deno.startTls(tcp,{hostname:'localhost',caCerts:[cert]});await c.handshake();return c;}};
 try{return await requestPinned(new URL('https://fixture.invalid/'),{timeout:opts.timeout||1000,maxBytes:opts.maxBytes||4096,transportOptions});}finally{await server;}
}
Deno.test('policy private mapped and mixed AAAA denied',async()=>{for(const ip of ['127.0.0.1','::ffff:127.0.0.1','169.254.169.254','fc00::1'])assert(!publicAddress(ip));await rejects(()=>resolvePublic('a.invalid',()=>Promise.resolve(['1.1.1.1','::1']) as any));});
Deno.test('stored URL restrictive',()=>{for(const server of ['ftp://a.test','http://a.test:22','http://a.test:443','https://a.test/path','https://a.test:444','https://u:p@a.test']){let failed=false;try{providerURL({type:'xtream',server},'live');}catch{failed=true;}assert(failed);}});
const headers='HTTP/1.1 200 OK\r\nContent-Type: application/json\r\n';
Deno.test('content length JSON success',async()=>assert((await fixture(headers+'Content-Length: 2\r\n\r\n[]')).length===0));
Deno.test('chunked JSON success',async()=>assert((await fixture(headers+'Transfer-Encoding: chunked\r\n\r\n2\r\n[]\r\n0\r\n\r\n')).length===0));
for(const [name,response]of Object.entries({redirect:'HTTP/1.1 302 Found\r\nLocation: http://127.0.0.1\r\nContent-Length: 0\r\n\r\n',duplicate:headers+'Content-Length: 2\r\nContent-Length: 2\r\n\r\n[]',ambiguous:headers+'Content-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n',truncated:headers+'Content-Length: 50\r\n\r\n[]',compressed:headers+'Content-Encoding: gzip\r\nContent-Length: 2\r\n\r\n[]',oversizedHeader:headers+'X-Large: '+'a'.repeat(17000)+'\r\nContent-Length: 2\r\n\r\n[]',badChunk:headers+'Transfer-Encoding: chunked\r\n\r\nZ\r\n[]\r\n0\r\n\r\n'}))Deno.test(name+' rejects',()=>rejects(()=>fixture(response)));
Deno.test('body cap rejects',()=>rejects(()=>fixture(headers+'Content-Length: 5000\r\n\r\n'+'a'.repeat(5000))));
Deno.test('total deadline',()=>rejects(()=>fixture(headers+'Content-Length: 2\r\n\r\n',{hold:150,timeout:40})));
