import {createCategoryModel, sortCategories} from './category-model.js';
import {getLang} from './i18n.js';
import './categories.css';
const esc = s => String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const eye = hidden => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" aria-hidden="true"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>${hidden?'<path d="m3 3 18 18"/>':''}</svg>`;
const tr = (ar,en) => getLang()==='ar'?ar:en;
export function openCategories({sb,device,playlists,apiBase=import.meta.env.VITE_CATEGORY_API_BASE||'',apiEndpoint=import.meta.env.VITE_CATEGORY_API_ENDPOINT||''}) {
  const prior = document.activeElement;
  const wrap = document.createElement('div'); wrap.className='category-scrim';
  wrap.innerHTML=`<section class="category-dialog" role="dialog" aria-modal="true" aria-labelledby="category-title" dir="ltr">
    <div class="category-header"><div><h2 id="category-title">${tr('إخفاء الفئات','Hide categories')}</h2><p class="category-device">${esc(device.customer||device.model||'TV')} <bdi>${esc(device.device_code)}</bdi></p></div><button class="category-close" aria-label="${tr('إغلاق','Close')}">×</button></div>
    ${import.meta.env.MODE==='e2e'?'<p class="category-preview" dir="auto">معاينة ببيانات تجريبية · ليست فئات اشتراك حقيقي</p>':''}
    <p class="category-help" dir="auto">${tr('اضغط العين لإخفاء الفئة أو إظهارها. الحفظ تلقائي لهالجهاز بس.','Tap the eye to hide or show a category. Changes save automatically for this TV only.')}</p>
    <div class="category-playlists" ${playlists.length<2?'hidden':''}><label for="category-playlist">${tr('الاشتراك','Playlist')}</label><select id="category-playlist" aria-label="${tr('الاشتراك','Playlist')}">${playlists.map(p=>`<option value="${esc(p.id)}">${esc(p.name)}</option>`).join('')}</select></div>
    <div class="category-tabs" role="tablist" aria-label="${tr('نوع المحتوى','Media type')}">${[['live','مباشر','Live'],['vod','أفلام','Movies'],['series','مسلسلات','Series']].map(([type,ar,en],i)=>`<button id="category-tab-${type}" role="tab" aria-selected="${i===0}" tabindex="${i===0?0:-1}" aria-controls="category-panel" data-media="${type}">${tr(ar,en)}</button>`).join('')}</div>
    <label class="category-search"><span class="sr-only">${tr('بحث بالفئات','Search categories')}</span><input type="search" placeholder="${tr('ابحث عن فئة…','Search categories…')}" autocomplete="off"></label>
    <div class="category-toolbar"><div class="category-filters" role="group" aria-label="${tr('تصفية الفئات','Filter categories')}">${[['all','الكل','All'],['hidden','المخفية','Hidden'],['visible','الظاهرة','Visible']].map(([f,ar,en],i)=>`<button type="button" class="category-chip" data-filter="${f}" aria-pressed="${i===0}">${tr(ar,en)}</button>`).join('')}</div><button type="button" class="category-showall" hidden>${tr('إظهار الكل','Show all')}</button></div><div class="category-summary" aria-live="polite"></div><div class="category-panel" id="category-panel" role="tabpanel" aria-labelledby="category-tab-live" tabindex="0"><div class="category-notice" role="status"></div><div class="category-list"></div></div>
    <p class="category-feedback" role="status" aria-live="polite"></p>
    </section>`;
  document.body.append(wrap); const previousOverflow=document.body.style.overflow; document.body.style.overflow='hidden';
  const $=s=>wrap.querySelector(s), list=$('.category-list'), notice=$('.category-notice'), search=$('input[type=search]');
  let filter='all',media='live', playlist=playlists[0]?.id, generation=0, closed=false, data=[], loading=false;
  const cache=new Map(), nodes=new Map();
  const model=createCategoryModel(async args=> {
    const {data:result,error}=await sb.rpc('admin_set_category_hidden',{p_device_id:device.id,p_playlist_id:args.playlist_id,p_media_type:args.media_type,p_category_id:args.category_id,p_hidden:args.hidden,p_expected_version:args.expected_version,p_provider_generation:args.provider_generation});
    if(error) throw new Error('not_saved'); return result;
  });
  function close(){closed=true;generation++;wrap.remove();document.body.style.overflow=previousOverflow;prior?.focus();}
  $('.category-close').onclick=close;
  wrap.onclick=e=>{if(e.target===wrap)close();};
  wrap.onkeydown=e=>{
    if(e.key==='Escape'){e.preventDefault();close();}
    if(e.key==='Tab'){
      const focusables=[...wrap.querySelectorAll('button,input,select,[tabindex="0"]')].filter(el=>!el.closest('[hidden]') && el.offsetParent!==null && el.tabIndex>=0);
      const first=focusables[0],last=focusables.at(-1);
      if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}
    }
  };
  function draw(){
    if(closed)return;
    const focus=document.activeElement;
    const rows=data.map(c=>model.get(playlist,media,c.id)).filter(Boolean);
    const hidden=rows.filter(c=>c.hidden).map(c=>c.id), sorted=sortCategories(rows,hidden,search.value).filter(r=>filter==='all'||(filter==='hidden')===r.hidden);
    const bulk=model.isBulk(playlist,media);
    wrap.querySelectorAll('.category-chip').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.filter===filter)));
    const sa=$('.category-showall');sa.hidden=loading||!hidden.length;sa.disabled=bulk;sa.setAttribute('aria-busy',String(bulk));
    const sm=$('.category-summary');sm.textContent='';
    if(!loading){const mk=(n,l)=>{const s=document.createElement('span');const b=document.createElement('bdi');b.className='category-count';b.textContent=String(n);const t=document.createElement('span');t.className='category-label';t.textContent=l;s.append(t,b);return s;};const hs=mk(hidden.length,tr('مخفية','hidden'));const hb=document.createElement('button');hb.type='button';hb.className='category-hidden-link';hb.dataset.filter='hidden';hb.append(...hs.childNodes);hb.onclick=()=>{filter='hidden';draw();};sm.append(mk(rows.length-hidden.length,tr('ظاهرة','visible')),Object.assign(document.createElement('span'),{className:'category-sep',textContent:'·'}),hb);}
    const keep=new Set();
    for(const row of sorted){
      const key=JSON.stringify([playlist,media,row.id]);keep.add(key);
      let node=nodes.get(key);
      if(!node){
        node=document.createElement('div'); node.className='category-row';
        const name=document.createElement('span');name.className='category-name';name.dir='auto';name.textContent=row.name;
        const btn=document.createElement('button'); btn.type='button';btn.className='category-eye';
                const targetPlaylist=playlist,targetMedia=media,id=row.id;
        btn.onclick=async()=>{
          if(model.isBulk(targetPlaylist,targetMedia))return;
          const result=await model.toggle(targetPlaylist,targetMedia,id,draw);
          if(closed||!result)return;
          if(result.providerChanged){cache.clear();nodes.clear();list.replaceChildren();load();return;}
          $('.category-feedback').textContent=result.error?tr('ما تم الحفظ. رجعنا للحالة المحفوظة، جرّب مرة تانية.','Not saved. Restored the saved state. Try again.'):tr('تم الحفظ تلقائياً','Saved automatically');
        };
        node.append(name,btn);nodes.set(key,node);
      }
      node.classList.toggle('is-hidden',row.hidden);node.classList.toggle('is-saving',row.saving);
      const btn=node.querySelector('button');btn.setAttribute('aria-label',`${row.hidden?tr('إظهار','Show'):tr('إخفاء','Hide')} ${row.name}`);btn.setAttribute('aria-pressed',String(row.hidden));btn.setAttribute('aria-disabled',String(row.saving));btn.setAttribute('aria-busy',String(row.saving));
      btn.innerHTML=row.saving?'<span class="category-spinner" aria-hidden="true"></span>':eye(row.hidden);
      list.append(node);
    }
    for(const [key,node] of nodes)if(!keep.has(key))node.remove();
    if(!loading&&rows.length&&sorted.length===0){notice.textContent=filter==='hidden'&&!search.value.trim()?tr('ما في فئات مخفية.','No hidden categories.'):tr('ما في نتائج لهالبحث.','No categories match your search.');notice.hidden=false;}
    else if(rows.length){notice.hidden=true;}
    if(focus && list.contains(focus))focus.focus({preventScroll:true});
  }
  async function load(){
    const gen=++generation,pid=playlist,type=media;loading=true;data=[];draw();
    notice.hidden=false;notice.textContent=tr('عم نحمّل الفئات…','Loading categories…');$('.category-feedback').textContent='';
    const pl=playlists.find(p=>p.id===pid);
    if(!pl){loading=false;notice.textContent=tr('أضف اشتراك لهالجهاز أولاً.','Add a playlist to this device first.');draw();return;}
    if(pl.type!=='xtream'){loading=false;notice.textContent=tr('قوائم M3U ما إلها أرقام فئات Xtream. إخفاء مجموعات M3U غير متاح حالياً.','M3U has no Xtream category IDs. Hiding M3U groups is not supported yet.');draw();return;}
    const cacheKey=JSON.stringify([pid,type]);
    try{
      if(!cache.has(cacheKey)){
        if(!apiBase&&!apiEndpoint)throw new Error('not_configured');
        const {data:{session}}=await sb.auth.getSession();
        if(!session)throw new Error('not_available');
        const response=await fetch(apiEndpoint||apiBase+'/api/admin/device-categories',{method:'POST',headers:{Authorization:'Bearer '+session.access_token,'Content-Type':'application/json'},body:JSON.stringify({device_id:device.id,playlist_id:pid,media_type:type}),signal:AbortSignal.timeout(12000)});
        if(!response.ok)throw new Error('not_available');
        const result=await response.json();
        if(result.status!=='ok'||result.playlist_id!==pid||result.media_type!==type||!Array.isArray(result.categories)||result.categories.length>10000||result.categories.some(c=>typeof c.id!=='string'||!/^\d{1,64}$/.test(c.id)||typeof c.name!=='string'||c.name.length>300))throw new Error('not_available');
        // Superseded/closed requests may never mutate either cache or the model.
        if(closed||gen!==generation)return;
        if(typeof result.provider_generation!=='string'||!result.hidden_category_ids||!result.category_versions)throw new Error('not_available');
        const hidden=new Set(result.hidden_category_ids[type]||[]);
        const cats=result.categories.map(c=>({...c,hidden:hidden.has(c.id),version:result.category_versions[type]?.[c.id]??0,provider_generation:result.provider_generation}));
        cache.set(cacheKey,cats);model.seed(pid,type,cats);
      }
      if(closed||gen!==generation)return;
      data=cache.get(cacheKey);loading=false;
      notice.textContent=data.length?'':tr('ما في فئات بهالقسم.','This section has no categories.');notice.hidden=!!data.length;draw();
    }catch{
      if(closed||gen!==generation)return;loading=false;
      notice.replaceChildren(document.createTextNode(tr('تعذّر تحميل الفئات. بيانات الاشتراك ما بتظهر هون.','Could not load categories. Subscription credentials stay private.')));
      const retry=document.createElement('button');retry.className='category-retry';retry.textContent=tr('جرّب مرة تانية','Try again');retry.onclick=load;notice.append(retry);notice.hidden=false;draw();
    }
  }
  function selectTab(button){filter='all';media=button.dataset.media;wrap.querySelectorAll('[role=tab]').forEach(el=>{el.setAttribute('aria-selected',String(el===button));el.tabIndex=el===button?0:-1;});$('#category-panel').setAttribute('aria-labelledby',button.id);load();}
  wrap.querySelectorAll('[role=tab]').forEach(btn=>{
    btn.onclick=()=>selectTab(btn);
    btn.onkeydown=e=>{if(!['ArrowLeft','ArrowRight','Home','End'].includes(e.key))return;e.preventDefault();const tabs=[...wrap.querySelectorAll('[role=tab]')],i=tabs.indexOf(btn),n=e.key==='Home'?0:e.key==='End'?2:(i+(e.key==='ArrowRight'?1:2))%3;tabs[n].focus();selectTab(tabs[n]);};
  });
  search.oninput=draw;
  wrap.querySelectorAll('.category-chip').forEach(b=>b.onclick=()=>{filter=b.dataset.filter;draw();});
  $('.category-showall').onclick=async()=>{
    const pid=playlist,type=media,ids=data.map(c=>c.id).filter(id=>model.get(pid,type,id)?.hidden);
    if(!ids.length||model.isBulk(pid,type))return;
    if(!window.confirm(tr('إظهار كل الفئات المخفية ('+ids.length+') بهالقسم؟','Show all '+ids.length+' hidden categories in this section?')))return;
    const fb=$('.category-feedback');fb.textContent=tr('عم نظهر الفئات…','Showing categories…');
    const res=await model.unhideAll(pid,type,ids,draw);
    if(closed)return;
    if(res.providerChanged){cache.clear();nodes.clear();list.replaceChildren();load();return;}
    fb.textContent=res.failed?tr('تم إظهار '+res.done+' من '+res.total+'. ما انحفظ '+res.failed+'، جرّب مرة تانية.','Showed '+res.done+' of '+res.total+'. '+res.failed+' not saved, try again.'):tr('تم إظهار '+res.done+' فئة','Showed '+res.done+' categories');
    if(res.failed)filter='hidden';draw();
  };
  $('#category-playlist').onchange=e=>{playlist=e.target.value;load();};
  $('.category-close').focus();load();
  return {close};
}
