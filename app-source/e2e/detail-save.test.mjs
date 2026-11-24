import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
const source=readFileSync(new URL('../src/main.js',import.meta.url),'utf8');
const start=source.indexOf('      let saved;');
const end=source.indexOf('      close(); toast(t(\'saved\')); renderDevice(deviceId);',start);
assert.ok(start>0 && end>start);
const code=source.slice(start,end)+"close(); toast(t('saved')); renderDevice(deviceId);";
const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
const handler=new AsyncFunction('sb','deviceId','p','v','form','sub','toast','quickText','close','t','renderDevice',code);
for(const [kind,result,ok] of [['saved',{data:{status:'saved',playlist_id:'fixture-playlist'},error:null},true],['error',{data:null,error:{message:'private payload'}},false],['unexpected',{data:{status:'invalid'},error:null},false],['empty',{data:null,error:null},false],['throw',null,false]]) {
 let calls=[],closed=false,rendered=false,messages=[];
 const form={dataset:{busy:'1'}},sub={disabled:true};
 const sb={rpc:async(name,args)=>{calls.push({name,args});if(kind==='throw')throw Error('private payload');return result;}};
 await handler(sb,'fixture-device',null,{row:{name:'Fixture',type:'m3u',url:'https://example.invalid/list',epg_url:null}},form,sub,(s,bad)=>messages.push({s,bad}),(ar,en)=>en,()=>closed=true,s=>s,()=>rendered=true);
 assert.equal(calls.length,1);assert.equal(calls[0].name,'admin_save_subscription');assert.equal(calls[0].args.p_device_id,'fixture-device');assert.equal(calls[0].args.p_playlist_id,null);
 assert.equal(closed,ok);assert.equal(rendered,ok);assert.equal(sub.disabled,false);assert.equal('busy' in form.dataset,false);assert.ok(messages.every(m=>!m.s.includes('private payload')));
}
const moduleText=readFileSync(new URL('../src/playlist.js',import.meta.url),'utf8');
const {validatePlaylist}=await import('data:text/javascript,'+encodeURIComponent(moduleText));
assert.deepEqual(validatePlaylist({name:'Fixture',type:'m3u',url:'provider.invalid/list'},'fixture-device'),{error:'errUrl',field:'url'});
assert.deepEqual(validatePlaylist({name:'Fixture',type:'xtream',server:'https://example.invalid'},'fixture-device'),{error:'errUser',field:'username'});
assert.deepEqual(validatePlaylist({name:'',type:'m3u',url:'https://example.invalid/list'},'fixture-device'),{error:'errName',field:'name'});
console.log('PASS five mocked detail-save outcomes and three browser-validation fixtures. No network.');
