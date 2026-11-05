import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createSignatureGate} from './auth-admission.js';
import {createCategoryHandler} from './handler.js';
const uid='00000000-0000-0000-0000-000000000003',uid2='00000000-0000-0000-0000-000000000004';
const b64=b=>btoa(String.fromCharCode(...b)).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const enc=o=>b64(new TextEncoder().encode(JSON.stringify(o)));
async function signing(){
 const keys=await crypto.subtle.generateKey({name:'ECDSA',namedCurve:'P-256'},true,['sign','verify']);
 const jwk={...await crypto.subtle.exportKey('jwk',keys.publicKey),kid:'known',alg:'ES256',use:'sig'};
 const sign=async(claims={},header={})=>{const h=enc({alg:'ES256',kid:'known',...header}),p=enc({iss:'https://project.invalid/auth/v1',exp:2000,...claims});return h+'.'+p+'.'+b64(new Uint8Array(await crypto.subtle.sign({name:'ECDSA',hash:'SHA-256'},keys.privateKey,new TextEncoder().encode(h+'.'+p))));};
 return {jwk,sign};
}
const request=token=>new Request('https://gateway.invalid/device-categories',{method:'POST',headers:{origin:'https://panel.example',authorization:'Bearer '+token,'content-type':'application/json','x-forwarded-for':'1.1.1.1'},body:JSON.stringify({device_id:uid,playlist_id:uid2,media_type:'live'})});
function client(user=uid){return {auth:{getUser:async()=>({data:{user:{id:user}}})},rpc:async name=>name==='is_admin'?{data:true}:name==='category_gateway_acquire'?{data:{status:'admitted',lease_id:uid2}}:{data:{}},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:null})};return q;}};}
const handler=opts=>createCategoryHandler({origin:'https://panel.example',url:'https://project.invalid',gatewayToken:'private',...opts});
test('JWKS signature gate validates exp issuer algorithm signature, refresh bounded',async()=>{
 const {jwk,sign}=await signing();let hits=0;
 const gate=createSignatureGate({url:'https://project.invalid',now:()=>1000000,fetcher:async()=>{hits++;return Response.json({keys:[jwk]});}});
 assert.equal(await gate(await sign()),true);
 for(const token of ['junk',await sign({exp:999}),await sign({iss:'https://evil.invalid'}),await sign({},{alg:'none'}),(await sign())+'bad',await sign({},{kid:'unknown'})])assert.equal(await gate(token),false);
 assert.equal(hits,1);
});
test('cold admin works amidst 48 cryptographic junk requests, zero junk Auth or quota',async()=>{
 const {jwk,sign}=await signing();let auths=0,quotas=0;
 const gate=createSignatureGate({url:'https://project.invalid',now:()=>1000000,fetcher:async()=>Response.json({keys:[jwk]})});
 const good=await sign(),bad=good.slice(0,-8)+'AAAAAAAA';
 const c=client(),rpc=c.rpc;c.auth.getUser=async()=>{auths++;return {data:{user:{id:uid}}};};c.rpc=async n=>{if(n==='category_gateway_acquire')quotas++;return rpc(n);};
 const h=handler({signatureGate:gate,clientFactory:()=>c});
 const pending=Array.from({length:48},()=>h(request(bad)));const admin=h(request(good));
 assert.equal((await admin).status,404);assert.ok((await Promise.all(pending)).every(r=>r.status===401));assert.equal(auths,1);assert.equal(quotas,1);
});
test('reserved previously validated admin lane survives eight signed unknown Auth calls',async()=>{
 let unblock,started;const ready=new Promise(r=>started=r),hold=new Promise(r=>unblock=r);let calls=0,quotas=0,waiting=0;
 const h=handler({signatureGate:async()=>true,clientFactory:(_u,_k,o)=>{
  const t=o.global.headers.Authorization.slice(7),c=client();const rpc=c.rpc;
  c.auth.getUser=async()=>{calls++;if(t.startsWith('invalid')){if(++waiting===8)started();await hold;return {error:{}};}return {data:{user:{id:uid}}};};
  c.rpc=async n=>{if(n==='category_gateway_acquire')quotas++;return rpc(n);};return c;
 }});
 assert.equal((await h(request('admin'))).status,404);
 const burst=Array.from({length:8},(_,i)=>h(request('invalid'+i)));
 await ready;
 assert.equal((await h(request('admin'))).status,404);unblock();
 assert.ok((await Promise.all(burst)).every(r=>r.status===401));assert.equal(quotas,2);assert.equal(calls,10);
});
test('unvalidated UUID and nonadmin never charge provider quota; per-user local isolation',async()=>{
 let user=uid,admin=true,quota=0;
 const h=handler({signatureGate:async()=>true,clientFactory:()=>{const c=client(user);const rpc=c.rpc;c.rpc=async n=>{if(n==='is_admin')return {data:admin};if(n==='category_gateway_acquire')quota++;return rpc(n);};return c;}});
 user='unchecked';assert.equal((await h(request('t'))).status,401);
 user=uid;admin=false;assert.equal((await h(request('t'))).status,403);assert.equal(quota,0);
 admin=true;for(let i=0;i<20;i++)assert.equal((await h(request('t'))).status,404);
 assert.equal((await h(request('t'))).status,429);user=uid2;assert.equal((await h(request('other'))).status,404);assert.equal(quota,21);
});
test('bounded digest cache evicts earliest entry; still revalidates every admin request',async()=>{
 let count=0,held=false,unblock,started,waiting=0;const ready=new Promise(r=>started=r),hold=new Promise(r=>unblock=r);
 const h=handler({now:()=>1,signatureGate:async()=>true,clientFactory:(_u,_k,o)=>{
  const token=o.global.headers.Authorization.slice(7);const n=token.startsWith('a')?Number(token.slice(1))+1:999;
  const c=client('00000000-0000-0000-0000-'+String(n).padStart(12,'0'));
  c.auth.getUser=async()=>{count++;if(held&&token.startsWith('junk')){if(++waiting===8)started();await hold;return {error:{}};}return {data:{user:{id:'00000000-0000-0000-0000-'+String(n).padStart(12,'0')}}};};return c;
 }});
 for(let i=0;i<257;i++)assert.equal((await h(request('a'+i))).status,404);
 assert.equal(count,257);held=true;const burst=Array.from({length:8},(_,i)=>h(request('junk'+i)));await ready;
 assert.equal((await h(request('a0'))).status,429);assert.equal((await h(request('a256'))).status,404);unblock();await Promise.all(burst);
});
test('JWKS outage grants at most one stale minute and never skips Auth',async()=>{
 const {jwk,sign}=await signing();let time=1000000,fail=false,hits=0;
 const gate=createSignatureGate({url:'https://project.invalid',now:()=>time,fetcher:async()=>{hits++;if(fail)throw new Error('outage');return Response.json({keys:[jwk]});}});
 const token=await sign();assert.equal(await gate(token),true);fail=true;time+=300001;assert.equal(await gate(token),true);time+=60000;assert.equal(await gate(token),false);assert.equal(hits,3);
});
test('HS256 legacy compatibility is isolated from cold ES256 admin admission',async()=>{
 const {jwk,sign}=await signing();const good=await sign(),legacy=enc({alg:'HS256'})+'.'+enc({sub:uid})+'.'+b64(new Uint8Array(32));
 const gate=createSignatureGate({url:'https://project.invalid',now:()=>1000000,fetcher:async()=>Response.json({keys:[jwk]})});
 assert.equal(await gate(legacy),'legacy');let started,unblock,waiting=0,quota=0;const ready=new Promise(r=>started=r),hold=new Promise(r=>unblock=r);
 const h=handler({signatureGate:gate,clientFactory:(_u,_k,o)=>{const c=client(),rpc=c.rpc;c.auth.getUser=async()=>{if(o.global.headers.Authorization.slice(7)===legacy){if(++waiting===2)started();await hold;return {error:{}};}return {data:{user:{id:uid}}};};c.rpc=async n=>{if(n==='category_gateway_acquire')quota++;return rpc(n);};return c;}});
 const pending=[h(request(legacy)),h(request(legacy))];await ready;assert.equal((await h(request(legacy))).status,429);assert.equal((await h(request(good))).status,404);unblock();assert.ok((await Promise.all(pending)).every(r=>r.status===401));assert.equal(quota,1);
});
