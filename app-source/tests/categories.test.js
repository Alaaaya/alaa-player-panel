import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createCategoryModel,sortCategories} from '../src/category-model.js';
import {publicAddress,providerURL,pinnedProviderCategories} from '../server/provider-fetch.js';
import {createCategoryHandler} from '../server/categories-handler.js';
import {EventEmitter} from 'node:events';
const playlist={type:'xtream',server:'https://provider.example',username:'private-user',password:'private-password'};
test('hidden before visible, stable provider order and search',()=>{assert.deepEqual(sortCategories([{id:'2',name:'Sport 2'},{id:'1',name:'News'},{id:'3',name:'Sport 1'}],['2'],'sport').map(x=>x.id),['2','3']);});
test('unhideAll only touches hidden rows in its scope, blocks concurrent single toggles, reports partial failure',async()=>{
 const writes=[];let n=0;const model=createCategoryModel(async a=>{writes.push(a.category_id);if(++n===2)throw new Error('x');return {status:'saved',hidden:a.hidden,version:a.expected_version+1};});
 model.seed('a','live',[{id:'1',hidden:true},{id:'2',hidden:true},{id:'3',hidden:false},{id:'4',hidden:true}]);model.seed('a','vod',[{id:'1',hidden:true}]);
 const p=model.unhideAll('a','live',['1','2','3','4']);assert.equal(model.isBulk('a','live'),true);assert.equal(await model.toggle('a','live','3'),undefined);
 const r=await p;assert.deepEqual(r,{total:3,done:2,failed:1,providerChanged:false});assert.deepEqual(writes,['1','2','4']);
 assert.equal(model.get('a','live','2').hidden,true);assert.equal(model.get('a','vod','1').hidden,true);assert.equal(model.isBulk('a','live'),false);
});
test('isolated media/playlist writes, optimistic change, duplicate click suppressed',async()=>{
 let release,writes=[];const model=createCategoryModel(args=>{writes.push(args);return new Promise(r=>release=r);});
 for(const pl of ['a','b'])for(const media of ['live','vod'])model.seed(pl,media,[{id:'7',name:'X',hidden:false}]);
 const pending=model.toggle('a','live','7');assert.equal(model.get('a','live','7').hidden,true);await model.toggle('a','live','7');assert.equal(writes.length,1);assert.equal(model.get('a','vod','7').hidden,false);assert.equal(model.get('b','live','7').hidden,false);release({status:'saved',hidden:true,version:1});await pending;assert.equal(model.get('a','live','7').version,1);
});
test('failed save rolls back, stale conflict adopts authoritative state',async()=>{
 const model=createCategoryModel(async()=>{throw new Error('no');});model.seed('a','live',[{id:'7',hidden:false}]);await model.toggle('a','live','7');assert.equal(model.get('a','live','7').hidden,false);assert.equal(model.get('a','live','7').error,true);
 const conflict=createCategoryModel(async()=>({status:'conflict',hidden:true,version:8}));conflict.seed('a','vod',[{id:'7',hidden:false}]);await conflict.toggle('a','vod','7');assert.equal(conflict.get('a','vod','7').version,8);
});
for(const address of ['127.0.0.1','10.0.0.1','169.254.169.254','100.100.100.200','0.0.0.0','::1','fe80::1','fc00::1','::ffff:127.0.0.1','224.0.0.1','192.0.0.1','198.18.0.1','2001:db8::1','2002:7f00:1::'])test('blocks special destination '+address,()=>assert.equal(publicAddress(address),false));
test('public unicast accepted',()=>{assert.equal(publicAddress('8.8.8.8'),true);assert.equal(publicAddress('2606:4700:4700::1111'),true);});
for(const server of ['http://provider.example','https://user:pass@provider.example','https://provider.example/private','https://provider.example?url=x','https://provider.example:9999'])test('rejects stored unsafe URL '+server,()=>assert.throws(()=>providerURL({...playlist,server},'live')));
test('typed fixed actions, never arbitrary upstream action',()=>{assert.equal(providerURL(playlist,'vod').searchParams.get('action'),'get_vod_categories');assert.throws(()=>providerURL(playlist,'delete'));});
test('mixed DNS answer blocks before connection',async()=>{let called=false;await assert.rejects(pinnedProviderCategories(playlist,'live',{resolve:async()=>[{address:'8.8.8.8',family:4},{address:'127.0.0.1',family:4}],request:()=>{called=true;}}),/provider_unavailable/);assert.equal(called,false);});
function mockRequest({code=200,body='[]',headers={'content-type':'application/json'},inspect=()=>{}}={}){
 return (url,options,callback)=>{inspect(url,options);const req=new EventEmitter();req.end=()=>{const res=new EventEmitter();res.statusCode=code;res.headers=headers;res.destroy=()=>{};callback(res);queueMicrotask(()=>{res.emit('data',Buffer.from(body));res.emit('end');});};return req;};
}
test('DNS pin actually passed to socket, credentials never in return',async()=>{
 let pins=[];const request=mockRequest({body:JSON.stringify([{category_id:7,category_name:'News'}]),inspect:(_url,options)=>{assert.equal(options.agent,false);options.lookup('provider.example',{},(_e,address,family)=>pins.push([address,family]));}});
 const r=await pinnedProviderCategories(playlist,'live',{resolve:async()=>[{address:'8.8.8.8',family:4}],request});assert.deepEqual(pins,[['8.8.8.8',4]]);assert.deepEqual(r,[{id:'7',name:'News'}]);assert.ok(!JSON.stringify(r).includes('private-password'));
});
for(const scenario of [{code:302},{body:'x'},{body:'{}'},{body:'[{"category_id":{},"category_name":"x"}]'},{body:'x'.repeat(100),maxBytes:10},{headers:{'content-type':'application/json','content-encoding':'gzip'}}])test('bounded upstream rejects '+JSON.stringify(scenario).slice(0,100),async()=>{await assert.rejects(pinnedProviderCategories(playlist,'live',{resolve:async()=>[{address:'8.8.8.8',family:4}],request:mockRequest(scenario),maxBytes:scenario.maxBytes||1024}),/^Error: provider_unavailable$/);});
const device='00000000-0000-0000-0000-000000000001',pl='00000000-0000-0000-0000-000000000002';
const request=(body={device_id:device,playlist_id:pl,media_type:'live'},token='good',origin='https://panel.example')=>new Request('https://proxy.example/api/admin/device-categories',{method:'POST',headers:{origin,'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify(body)});
function factory({user=true,admin=true,found=true,type='xtream'}={}){return ()=>({auth:{getUser:async()=>({data:{user:user?{id:'u'}:null}})},rpc:async(name)=>({data:name==='category_gateway_acquire'?{status:'admitted',lease_id:'00000000-0000-0000-0000-000000000099'}:name==='category_gateway_release'?null:name==='is_admin'?admin:{provider_generation:'generation-fixture',hidden_category_ids:{live:[],vod:[],series:[]},category_versions:{live:{},vod:{},series:{}}}}),from:()=>{const filters={};const q={select:()=>q,eq:(key,val)=>{filters[key]=val;return q;},maybeSingle:async()=>{assert.equal(filters.id,pl);assert.equal(filters.device_id,device);return {data:found?{...playlist,type,category_provider_generation:'generation-fixture'}:null};}};return q;}});}
for(const [name,config,status]of [['invalidJWT',{user:false},401],['nonadmin',{admin:false},403],['crossDevice',{found:false},404],['m3u',{type:'m3u'},422]])test('secure handler '+name,async()=>{let fetched=false;const handle=createCategoryHandler({origin:'https://panel.example',gatewayToken:'server-secret',clientFactory:factory(config),fetchCategories:async()=>{fetched=true;return [];}});const res=await handle(request());assert.equal(res.status,status);assert.equal(fetched,false);});
test('rejects browser provider URL, untrusted origin, and limits calls',async()=>{let calls=0;const handle=createCategoryHandler({origin:'https://panel.example',gatewayToken:'server-secret',clientFactory:factory(),fetchCategories:async()=>{calls++;return [{id:'7',name:'News'}];}});assert.equal((await handle(request({...{device_id:device,playlist_id:pl,media_type:'live'},server:'https://attacker.example'}))).status,400);assert.equal((await handle(request(undefined,'good','https://evil.example'))).status,403);for(let i=0;i<19;i++)assert.equal((await handle(request())).status,200);assert.equal((await handle(request())).status,429);assert.equal(calls,19);});
