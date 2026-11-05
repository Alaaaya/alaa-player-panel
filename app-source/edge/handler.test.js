import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCategoryHandler} from './handler.js';
const device='00000000-0000-0000-0000-000000000001',playlist='00000000-0000-0000-0000-000000000002',lease='00000000-0000-0000-0000-000000000099';
const req=()=>new Request('https://gateway.invalid/functions/v1/device-categories',{method:'POST',headers:{origin:'https://panel.example',authorization:'Bearer validated','content-type':'application/json'},body:JSON.stringify({device_id:device,playlist_id:playlist,media_type:'live'})});
function factory({admission={status:'admitted',lease_id:lease},limitError=null,fetchFails=false}={}){
 const calls=[];
 const client={auth:{getUser:async()=>({data:{user:{id:'00000000-0000-0000-0000-000000000003'}}})},rpc:async(name,args)=>{calls.push({name,args});return name==='is_admin'?{data:true}:name==='category_gateway_acquire'?{data:admission,error:limitError}:name==='admin_get_category_snapshot'?{data:{provider_generation:'epoch'}}:{data:null};},from:()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:{id:playlist,device_id:device,type:'xtream',category_provider_generation:'epoch',server:'https://provider.example',username:'secret-user',password:'secret-password'}})};return q;}};
 return {calls,clientFactory:()=>client};
}
test('missing shared-limiter secret fails closed before provider',async()=>{const f=factory();let fetched=false;const h=createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example',...f,fetchCategories:async()=>{fetched=true;return [];}});assert.equal((await h(req())).status,503);assert.equal(fetched,false);assert.equal(f.calls.some(x=>x.name==='category_gateway_acquire'),false);});
for(const [label,options,status] of [['DB unavailable',{limitError:{message:'private database error'}},503],['shared budget exhausted',{admission:{status:'rate_limited'}},429],['malformed admission',{admission:{status:'admitted',lease_id:'not-uuid'}},429]])test(label+' denies fetch without fallback',async()=>{const f=factory(options);let fetched=false;const h=createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example',gatewayToken:'private-server-token',...f,fetchCategories:async()=>{fetched=true;return [];}});const r=await h(req());assert.equal(r.status,status);assert.equal(fetched,false);assert.ok(!(await r.text()).includes('private'));});
for(const failure of [false,true])test('lease released on provider '+(failure?'failure':'success')+' and secrets redacted',async()=>{const f=factory();const h=createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example',gatewayToken:'private-server-token',...f,fetchCategories:async()=>{if(failure)throw new Error('https://provider.example?password=secret-password');return [{id:'1',name:'News'}];}});const r=await h(req());assert.equal(r.status,failure?502:200);const text=await r.text();for(const secret of ['secret-password','secret-user','private-server-token','provider.example'])assert.equal(text.includes(secret),false);assert.deepEqual(f.calls.filter(x=>x.name==='category_gateway_release')[0].args,{p_gateway_token:'private-server-token',p_lease_id:lease});});
test('two fresh handler processes cannot bypass shared quota',async()=>{let hits=0,fetches=0;const f=factory();const base=f.clientFactory();const original=base.rpc;base.rpc=async(name,args)=>name==='category_gateway_acquire'?{data:++hits<=2?{status:'admitted',lease_id:lease}:{status:'rate_limited'}}:original(name,args);const make=()=>createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example',gatewayToken:'private-server-token',clientFactory:()=>base,fetchCategories:async()=>{fetches++;return [];}});assert.equal((await make()(req())).status,200);assert.equal((await make()(req())).status,200);assert.equal((await make()(req())).status,429);assert.equal(fetches,2);});
for(const mode of ['missing','m3u','epoch','snapshot-error'])test('lease released on '+mode+' exit',async()=>{
 const f=factory(),client=f.clientFactory(),original=client.rpc;
 if(mode==='missing'||mode==='m3u')client.from=()=>{const q={select:()=>q,eq:()=>q,maybeSingle:async()=>({data:mode==='missing'?null:{type:'m3u'}})};return q;};
 if(mode==='epoch'||mode==='snapshot-error')client.rpc=async(name,args)=>name==='admin_get_category_snapshot'?{data:mode==='epoch'?{provider_generation:'changed'}:null,error:mode==='snapshot-error'?{}:null}:original(name,args);
 const h=createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example',gatewayToken:'private-server-token',clientFactory:()=>client,fetchCategories:async()=>[]});
 assert.equal((await h(req())).status,({missing:404,m3u:422,epoch:409,'snapshot-error':409})[mode]);
 assert.equal(f.calls.filter(c=>c.name==='category_gateway_release').length,1);
});
test('untrusted URL fields rejected before shared admission',async()=>{
 const f=factory();const h=createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example',gatewayToken:'private-server-token',...f});
 const r=req(),body=await r.json();body.server='https://attacker.invalid';
 const result=await h(new Request(r.url,{method:'POST',headers:r.headers,body:JSON.stringify(body)}));
 assert.equal(result.status,400);assert.equal(f.calls.some(c=>c.name==='category_gateway_acquire'),false);
});

for (const path of ['/functions/v1/device-categories','/device-categories']) test('exact route authenticates: '+path,async()=>{
 const h=createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example'});
 const r=new Request('https://gateway.invalid'+path,{method:'POST',headers:{origin:'https://panel.example'}});
 assert.equal((await h(r)).status,401);
});
for (const path of ['/other','/other/device-categories','/functions/v1/other','/device-categories/','/device-categories/extra','/functions/v1/device-categories/extra','/device%2dcategories']) test('route rejects non-exact path: '+path,async()=>{
 const h=createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example'});
 const r=new Request('https://gateway.invalid'+path,{method:'POST',headers:{origin:'https://panel.example'}});
 assert.equal((await h(r)).status,404);
});
test('configured function route does not admit default or suffix routes',async()=>{
 const h=createCategoryHandler({signatureGate:async()=>true,origin:'https://panel.example',endpoint:'/functions/v1/custom-categories'});
 for(const path of ['/custom-categories','/functions/v1/custom-categories','/device-categories','/other/custom-categories']){
  const r=new Request('https://gateway.invalid'+path,{method:'POST',headers:{origin:'https://panel.example'}});
  assert.equal((await h(r)).status,path==='/custom-categories'||path==='/functions/v1/custom-categories'?401:404);
 }
});
