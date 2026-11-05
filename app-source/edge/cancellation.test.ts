import {openPinned} from './provider.ts';
function assert(v:unknown){if(!v)throw new Error('assertion');}
function deferred(){let resolve!:(v?:any)=>void;const promise=new Promise<any>(r=>resolve=r);return {promise,resolve};}
for(const stage of ['dns','tcp','tls','handshake','handoff'])Deno.test('abort during '+stage+' closes late handles',async()=>{
 const controller=new AbortController(),entered=deferred(),release=deferred();let tcpClosed=0,tlsClosed=0,handshakes=0,dials=0;
 const tcp={remoteAddr:{hostname:'1.1.1.1'},close:()=>tcpClosed++};
 const tls={remoteAddr:{hostname:'1.1.1.1'},close:()=>{tlsClosed++;if(stage==='handshake')release.resolve();},handshake:async()=>{handshakes++;if(stage==='handshake'){entered.resolve();await release.promise;}}};
 const pending=openPinned('fixture.invalid',443,controller.signal,{
 resolve:async()=>{if(stage==='dns'){entered.resolve();await release.promise;}return ['1.1.1.1'];},
 connect:async()=>{dials++;if(stage==='tcp'){entered.resolve();await release.promise;}return tcp;},
 startTls:async()=>{if(stage==='tls'){entered.resolve();await release.promise;}return tls;}
 });
 if(stage==='handoff'){await pending;controller.abort();assert(tcpClosed>0&&tlsClosed>0);return;}
 await entered.promise;controller.abort();release.resolve();try{await pending;throw new Error('must reject');}catch(e){assert((e as Error).message==='provider_unavailable');}
 if(stage==='dns')assert(dials===0);
 if(stage==='tcp')assert(tcpClosed>0&&handshakes===0);
 if(stage==='tls')assert(tcpClosed>0&&tlsClosed>0&&handshakes===0);
 if(stage==='handshake')assert(tcpClosed>0&&tlsClosed>0&&handshakes===1);
});

Deno.test('abort before TLS upgrade never invokes startTls',async()=>{
 const controller=new AbortController();let closed=0,upgrades=0;
 const tcp={get remoteAddr(){controller.abort();return {hostname:'1.1.1.1'};},close:()=>closed++};
 try{await openPinned('fixture.invalid',443,controller.signal,{resolve:async()=>['1.1.1.1'],connect:async()=>tcp,startTls:async()=>{upgrades++;throw new Error('must not upgrade');}});throw new Error('must reject');}catch(e){assert((e as Error).message==='provider_unavailable');}
 assert(upgrades===0&&closed>0);
});
