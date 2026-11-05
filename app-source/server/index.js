import http from 'node:http';
import {pathToFileURL} from 'node:url';
import {createCategoryHandler} from './categories-handler.js';

export function createGatewayServer({handle}={}) {
 const respond=(res,status,body)=>{if(!res.destroyed && !res.headersSent){res.writeHead(status,{'Content-Type':'application/json','Cache-Control':'no-store','X-Content-Type-Options':'nosniff'});res.end(JSON.stringify(body));}};
 let active=0;
 const server=http.createServer({maxHeaderSize:16384},async(req,res)=>{
  if(req.method==='GET' && req.url==='/healthz') return respond(res,200,{status:'ok'});
  if(req.url!=='/api/admin/device-categories') return respond(res,404,{status:'not_found'});
  if(!['POST','OPTIONS'].includes(req.method)) return respond(res,405,{status:'invalid'});
  if(active>=16) return respond(res,429,{status:'rate_limited'});
  if(req.headers['content-length'] && (!/^\d+$/.test(req.headers['content-length']) || Number(req.headers['content-length'])>1024)) return respond(res,413,{status:'invalid'});
  active++;
  let timer;const chunks=[];let bytes=0;
  try {
   const body=await new Promise((resolve,reject)=>{
    timer=setTimeout(()=>{reject(new Error('timeout'));},3000);
    req.on('data',chunk=>{bytes+=chunk.length;if(bytes>1024)reject(new Error('large'));else chunks.push(chunk);});
    req.on('end',()=>resolve(Buffer.concat(chunks)));
    req.on('error',()=>reject(new Error('request')));
    req.on('aborted',()=>reject(new Error('request')));
   });
   clearTimeout(timer);
   const headers=new Headers();
   for(const [k,v] of Object.entries(req.headers)) if(v!==undefined) headers.set(k,Array.isArray(v)?v.join(','):v);
   const request=new Request('https://gateway.invalid'+req.url,{method:req.method,headers,...(req.method==='POST'?{body}: {})});
   const result=await handle(request);
   if(!res.destroyed){res.writeHead(result.status,Object.fromEntries(result.headers));res.end(Buffer.from(await result.arrayBuffer()));}
  }catch {respond(res,bytes>1024?413:400,{status:'invalid'});}
  finally {clearTimeout(timer);active--;if(!req.complete)req.destroy();}
 });
 server.headersTimeout=5000;server.requestTimeout=10000;server.keepAliveTimeout=5000;server.maxRequestsPerSocket=50;server.maxConnections=128;
 server.on('clientError',(_error,socket)=>{socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
 return server;
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
 const {SUPABASE_URL:url,SUPABASE_ANON_KEY:anonKey,PANEL_ORIGIN:origin,CATEGORY_GATEWAY_TOKEN:gatewayToken}=process.env;
 if(!url || !anonKey || !origin || !gatewayToken || !/^https:\/\//.test(url) || !/^https:\/\//.test(origin)) throw new Error('Gateway configuration missing');
 const server=createGatewayServer({handle:createCategoryHandler({url,anonKey,origin,gatewayToken})});
 server.listen(Number(process.env.PORT||10000),'0.0.0.0');
}
