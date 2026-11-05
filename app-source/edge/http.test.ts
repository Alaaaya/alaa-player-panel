import {requestPinned,openPinned,providerURL} from './provider.ts';
function assert(v:unknown){if(!v)throw new Error('assertion');}
async function rejects(fn:()=>Promise<unknown>){try{await fn();}catch{return;}throw new Error('expected rejection');}
const response='HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\n\r\n[]';
async function fixture(data:string,opts:any={}){
 const listener=Deno.listen({hostname:'127.0.0.1',port:0});
 const server=(async()=>{try{const c=await listener.accept();await c.read(new Uint8Array(4096));await c.write(new TextEncoder().encode(data));if(opts.hold)await new Promise(r=>setTimeout(r,opts.hold));c.close();}catch{}finally{listener.close();}})();
 const transportOptions={testOpen:()=>Deno.connect({hostname:'127.0.0.1',port:listener.addr.port})};
 try{return await requestPinned(new URL('http://fixture.invalid/'),{timeout:opts.timeout||1000,maxBytes:opts.maxBytes||4096,transportOptions});}finally{await server;}
}
Deno.test('plain HTTP success uses maintained parser without TLS',async()=>assert((await fixture(response)).length===0));
Deno.test('HTTP URL ports only 80 and 8080, HTTPS only 443 and 8443',()=>{
 for(const server of ['http://public.example','http://public.example:8080','https://public.example:8443'])assert(providerURL({type:'xtream',server,username:'u',password:'p'},'live').protocol===new URL(server).protocol);
});
for(const ip of ['127.0.0.1','169.254.169.254','10.0.0.1','::1','fc00::1','::ffff:127.0.0.1'])Deno.test('HTTP denies private '+ip+' before dialing',async()=>{
 let dials=0;await rejects(()=>openPinned('fixture.invalid',80,new AbortController().signal,{protocol:'http:',resolve:async()=>['1.1.1.1',ip],connect:async()=>{dials++;}}));assert(dials===0);
});
Deno.test('HTTP pins one all-public resolved literal, never upgrades TLS and closes on abort',async()=>{
 const controller=new AbortController();let resolves=0,closed=0;
 const tcp={remoteAddr:{hostname:'1.1.1.1'},close:()=>closed++};
 const got=await openPinned('fixture.invalid',80,controller.signal,{protocol:'http:',resolve:async()=>{resolves++;return ['1.1.1.1'];},connect:async(o:any)=>{assert(o.hostname==='1.1.1.1'&&o.port===80);return tcp;},startTls:()=>{throw new Error('unexpected TLS');}});
 assert(got===tcp&&resolves===2);controller.abort();assert(closed>0);
});
Deno.test('HTTP mismatched literal peer fails closed and closes socket',async()=>{
 let closed=0;await rejects(()=>openPinned('fixture.invalid',80,new AbortController().signal,{protocol:'http:',resolve:async()=>['1.1.1.1'],connect:async()=>({remoteAddr:{hostname:'127.0.0.1'},close:()=>closed++})}));assert(closed>0);
});
for(const port of [0,22,53,443,2375,5432,6379,65535])Deno.test('HTTP denied destination port '+port,()=>rejects(()=>openPinned('1.1.1.1',port,new AbortController().signal,{protocol:'http:'})));
for(const [name,data] of Object.entries({redirect:'HTTP/1.1 302 Found\r\nLocation: http://169.254.169.254/\r\nContent-Length: 0\r\n\r\n',httpsRedirect:'HTTP/1.1 301 Found\r\nLocation: https://public.example/\r\nContent-Length: 0\r\n\r\n',ambiguous:'HTTP/1.1 200 OK\r\nContent-Type: application/json\r\nContent-Length: 2\r\nTransfer-Encoding: chunked\r\n\r\n0\r\n\r\n',truncated:response.replace('Content-Length: 2','Content-Length: 100'),compressed:response.replace('Content-Length: 2','Content-Encoding: gzip\r\nContent-Length: 2')}))Deno.test('HTTP '+name+' rejects without redirect follow',()=>rejects(()=>fixture(data)));
Deno.test('HTTP body cap rejects',()=>rejects(()=>fixture(response.replace('Content-Length: 2','Content-Length: 5000'))));
Deno.test('HTTP deadline rejects',()=>rejects(()=>fixture(response.slice(0,-2),{hold:150,timeout:40})));
Deno.test('HTTP requestPinned real adapter wiring pins plaintext and does not call TLS',async()=>{
 const listener=Deno.listen({hostname:'127.0.0.1',port:0});let upgrades=0,dials=0;
 const server=(async()=>{try{const c=await listener.accept();await c.read(new Uint8Array(4096));await c.write(new TextEncoder().encode(response));c.close();}finally{listener.close();}})();
 try{const result=await requestPinned(new URL('http://fixture.invalid/'),{transportOptions:{resolve:async()=>['1.1.1.1'],connect:async(o:any)=>{assert(o.hostname==='1.1.1.1'&&o.port===80);dials++;const c=await Deno.connect({hostname:'127.0.0.1',port:listener.addr.port});return {remoteAddr:{hostname:'1.1.1.1'},read:(b:Uint8Array)=>c.read(b),write:(b:Uint8Array)=>c.write(b),close:()=>c.close()};},startTls:()=>{upgrades++;throw new Error('no TLS');}}});assert(result.length===0&&dials===1&&upgrades===0);}finally{await server;}
});
for(const [protocol,port] of [['http:',8443],['https:',80],['https:',8080]] as const)Deno.test(protocol+' cross-protocol port '+port+' denied',()=>rejects(()=>openPinned('1.1.1.1',port,new AbortController().signal,{protocol})));
