// Signature verification is admission only. Auth.getUser + is_admin remain mandatory.
// No claims, forwarded IPs, or token hashes grant authorization or DB quota.
const encoder = new TextEncoder();
const decode = s => {
  if(!/^[A-Za-z0-9_-]+$/.test(s)) throw new Error('invalid');
  return Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')), c=>c.charCodeAt(0));
};
export function createSignatureGate({url,now=Date.now,fetcher=fetch}={}) {
  const issuer = new URL('/auth/v1',url).href;
  const jwksUrl=issuer+'/.well-known/jwks.json';
  let keys=new Map(),expires=0,staleUntil=0,pending=null,retryAt=0,active=0;
  async function refresh() {
    if(pending) return pending;
    if(now()<retryAt) return;
    retryAt=now()+60000;
    pending=(async()=>{
      const r=await fetcher(jwksUrl,{redirect:'error',signal:AbortSignal.timeout(3000)});
      if(!r.ok) throw new Error('unavailable');
      const reader=r.body?.getReader();if(!reader)throw new Error('unavailable');
      let size=0,text='';const decoder=new TextDecoder();
      try {for(;;){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>32768)throw new Error('invalid');text+=decoder.decode(value,{stream:true});}text+=decoder.decode();}
      finally {await reader.cancel().catch(()=>{});}
      const set=JSON.parse(text),next=new Map();
      if(!Array.isArray(set.keys)||set.keys.length>16)throw new Error('invalid');
      for(const k of set.keys){
        if(k.kty!=='EC'||k.crv!=='P-256'||typeof k.kid!=='string'||k.kid.length>128||k.d|| (k.alg&&k.alg!=='ES256') || (k.use&&k.use!=='sig'))continue;
        if(next.has(k.kid))throw new Error('invalid');
        next.set(k.kid,await crypto.subtle.importKey('jwk',k,{name:'ECDSA',namedCurve:'P-256'},false,['verify']));
      }
      if(!next.size)throw new Error('unavailable');
      keys=next;expires=now()+300000;staleUntil=expires+60000;
    })();
    try {await pending;} finally {pending=null;}
  }
  return async token=>{
    // Bound signature CPU work independently of Auth and provider pools.
    if(active>=64)return false;
    active++;
    try {
      const parts=token.split('.');if(parts.length!==3)return false;
      const header=JSON.parse(new TextDecoder().decode(decode(parts[0])));
      // Existing HS256 sessions have no publicly verifiable key. They get a
      // separate tiny unknown lane, never the ES256 or known-admin lane.
      if(header.alg==='HS256'&&!header.crit&&decode(parts[2]).length===32)return 'legacy';
      if(header.alg!=='ES256'||typeof header.kid!=='string'||header.kid.length>128||header.crit)return false;
      if(expires<=now()||!keys.has(header.kid)){try{await refresh();}catch{/* One bounded minute of stale known-key admission; Auth still revalidates. */}}
      const key=keys.get(header.kid);if(!key||staleUntil<=now())return false;
      if(!await crypto.subtle.verify({name:'ECDSA',hash:'SHA-256'},key,decode(parts[2]),encoder.encode(parts[0]+'.'+parts[1])))return false;
      const claims=JSON.parse(new TextDecoder().decode(decode(parts[1])));
      // Even signed claims only reject here; getUser decides identity below.
      return claims.iss===issuer && Number.isFinite(claims.exp) && claims.exp*1000>now() && (!claims.nbf||(Number.isFinite(claims.nbf)&&claims.nbf*1000<=now()));
    }catch{return false;}finally{active--;}
  };
}
export async function tokenDigest(token) {
  return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',encoder.encode(token))),x=>x.toString(16).padStart(2,'0')).join('');
}
