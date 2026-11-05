import { t } from './i18n.js';
import {validatePlaylist} from './playlist.js';
export function publicPage({app,sb,esc,lang,theme,setTheme,themes}) {
 const ar=lang==='ar', text=(a,b)=>ar?a:b;
 app.innerHTML=`<section class="login"><div class="orb"></div><label class="login-theme"><span>${text('المظهر','Theme')}</span><select data-public-theme aria-label="${text('المظهر','Theme')}">${themes.map(x=>`<option value="${x}" ${x===theme?'selected':''}>${t('th_'+x)}</option>`).join('')}</select></label><button class="lang floating" data-lang>${ar?'EN':'ع'}</button><div class="login-card rise"><span class="glyph big">◐</span><h1>Alaa Player</h1><p class="muted">${text('فعّل اشتراكك','Activate subscription')}</p><p class="muted sm" dir="auto">${text('أدخل الكود الظاهر بالتطبيق وبيانات اشتراكك. التفعيل الفوري للأجهزة الجديدة غير المفعّلة فقط، والاشتراكات الموجودة بتتغير من الإدارة فقط.','Enter the code shown in the app and your subscription. Immediate activation works for new, inactive devices only. Existing subscriptions can only be changed by an administrator.')}</p><form id="public-request"><label>${text('كود الجهاز','Device code')}<input name="code" dir="ltr" autocapitalize="off" autocorrect="off" spellcheck="false" autocomplete="off" maxlength="16" placeholder="A1B2 C3D4 E5F6" required></label><label>${text('اسم الاشتراك','Subscription name')}<input name="name" maxlength="120" required></label><label>${text('النوع','Type')}<select name="type"><option value="xtream">Xtream</option><option value="m3u">M3U</option></select></label><div id="xtream-fields"><label>Server<input name="server" dir="ltr" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="2048" placeholder="https://provider.example"></label><label>${text('اسم المستخدم','Username')}<input name="username" dir="ltr" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="512" autocomplete="off"></label><label>${text('كلمة المرور','Password')}<input name="password" dir="ltr" autocapitalize="off" autocorrect="off" spellcheck="false" type="password" maxlength="512" autocomplete="new-password"></label></div><div id="m3u-fields" hidden><label>M3U URL<input name="url" dir="ltr" autocapitalize="off" autocorrect="off" spellcheck="false" maxlength="4096" placeholder="https://provider.example/list.m3u"></label></div><button class="btn primary wide">${text('تفعيل الاشتراك','Activate now')}</button><p id="request-result" role="status" aria-live="polite"></p></form></div></section>`;
 app.querySelector('[data-public-theme]').onchange=e=>{setTheme(e.target.value);};
 const f=app.querySelector('form'),out=app.querySelector('#request-result');
 f.elements.type.onchange=()=>{app.querySelector('#xtream-fields').hidden=f.elements.type.value!=='xtream';app.querySelector('#m3u-fields').hidden=f.elements.type.value!=='m3u';};
 f.onsubmit=async e=>{
 e.preventDefault(); if(f.dataset.busy)return;
 const v=Object.fromEntries(new FormData(f)),code=v.code.replace(/[ -]/g,'').toUpperCase();
 if(!/^[A-F0-9]{12}$/.test(code)){f.elements.code.focus();out.setAttribute('role','alert');out.textContent=text('الكود لازم يكون 12 حرف أو رقم مثل الظاهر بالتطبيق.','Enter the 12-character hexadecimal code shown in the app.');return;}
 const checked=validatePlaylist(v,null);
 if(checked.error){f.elements[checked.field]?.focus();out.setAttribute('role','alert');out.textContent=text('تأكد من بيانات الاشتراك والرابط، لازم يبدأ بـ http أو https.','Check subscription fields and use an http or https URL.');return;}
 out.setAttribute('role','status');f.dataset.busy='1';f.querySelector('button').disabled=true;
 try {
 const {data,error}=await sb.rpc('submit_subscription_request',{p_code:code,p_playlist:checked.row});
 if(error)throw Error();
 if(data?.status==='rate_limited')out.textContent=text('طلبات كثيرة. جرّب لاحقاً.','Too many requests. Please try later.');
 else if(data?.status==='activated'){f.reset();f.elements.type.onchange();out.textContent=text('تم التفعيل. حدّث التطبيق.','Activated. Refresh the app.');}
 else out.textContent=text('تعذر التفعيل. تأكد من الكود أو تواصل مع الإدارة.','Could not activate. Check the code or contact the administrator.');
 }catch{out.textContent=text('ما تم التفعيل. جرّب مرة ثانية.','Could not activate. Please try again.');}
 finally{delete f.dataset.busy;f.querySelector('button').disabled=false;}
 };
}
export async function requestQueue({app,sb,esc,shell,ar}) {
 const text=(a,b)=>ar?a:b;
 const {data,error}=await sb.from('subscription_requests').select('id,device_id,payload,created_at').eq('status','pending').order('created_at');
 const {data:devices}=await sb.from('devices').select('id,device_code,customer');
 const names=new Map((devices||[]).map(d=>[d.id,d]));
 app.innerHTML=shell(`<section class="quick-head"><div><h1>${text('طلبات التفعيل','Activation requests')}</h1><p class="muted">${text('تحقق من صاحب الجهاز قبل الموافقة. الكود وحده ما بيثبت الملكية. الموافقة تضيف اشتراك جديد وتفعّل الجهاز، بدون تمديد الصلاحية أو استبدال الموجود.','Verify the device owner before approving. A code alone does not prove ownership. Approval adds a playlist and activates the device without extending expiry or replacing existing playlists.')}</p></div><a href="#/" class="btn ghost">${text('رجوع','Back')}</a></section><section class="pending-list">${error?`<p role="alert">${text('تعذر تحميل الطلبات','Could not load requests')}</p>`:(data||[]).map(r=>{const d=names.get(r.device_id)||{};return `<article class="pending-device"><div><h2 class="mono">${esc(d.device_code)}</h2><p>${esc(d.customer)} · ${esc(r.payload.name)} · ${esc(r.payload.type)}</p><p class="muted">${esc(r.payload.type.toUpperCase())} · ${esc(new Date(r.created_at).toLocaleString())}</p><p class="muted sm">${text('بيانات الاشتراك مخفية هنا لحمايتها.','Subscription credentials are not displayed here.')}</p></div><div class="pending-actions"><button class="btn primary" data-review="${r.id}" data-approve="true">${text('موافقة وتفعيل','Approve and activate')}</button><button class="btn danger ghost" data-review="${r.id}" data-approve="false">${text('رفض','Reject')}</button></div></article>`;}).join('')||`<p>${text('ما في طلبات معلّقة','No pending requests')}</p>`}</section><p id="review-error" role="alert"></p>`);
 app.querySelectorAll('[data-review]').forEach(b=>b.onclick=async()=>{
 const approve=b.dataset.approve==='true';
 if(!confirm(approve?text('تأكدت من صاحب الجهاز؟ الموافقة تضيف الاشتراك وتفعّل الجهاز.','Have you verified the owner? Approval adds the playlist and activates the device.'):text('رفض الطلب؟','Reject this request?')))return;
 app.querySelectorAll('[data-review]').forEach(x=>x.disabled=true);
 const {error}=await sb.rpc('review_subscription_request',{p_request_id:b.dataset.review,p_approve:approve});
 if(error){app.querySelector('#review-error').textContent=text('تعذر تنفيذ القرار. حدّث الصفحة وحاول ثانية.','Could not save the decision. Refresh and retry.');app.querySelectorAll('[data-review]').forEach(x=>x.disabled=false);}
 else await requestQueue({app,sb,esc,shell,ar});
 });
}
