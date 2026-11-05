export const MEDIA_TYPES = ['live', 'vod', 'series'];
export const emptyHidden = () => ({live: [], vod: [], series: []});
export const categoryKey = (playlist, media, id) => JSON.stringify([playlist, media, String(id)]);
export function sortCategories(rows, hidden, search = '') {
  const ids = new Set(hidden), q = search.trim().toLocaleLowerCase();
  return rows.filter(r => r.name.toLocaleLowerCase().includes(q)).map((r, i) => ({...r, hidden: ids.has(r.id), order: i})).sort((a,b) => Number(b.hidden)-Number(a.hidden) || a.order-b.order);
}
// Independent row writes never replace another row, tab, playlist or device's state.
export function createCategoryModel(write) {
  const rows = new Map(), bulkScopes = new Set();
  return {
    seed(playlist, media, categories) { for(const c of categories) {
      const key = categoryKey(playlist, media, c.id);
      if (!rows.get(key)?.saving) rows.set(key, {...c, version: c.version ?? 0, saving:false});
    }},
    get(playlist, media, id) { return rows.get(categoryKey(playlist,media,id)); },
    isBulk(playlist, media) { return bulkScopes.has(JSON.stringify([playlist,media])); },
    // Sequentially unhide only rows hidden in this playlist/media; other scopes untouched.
    async unhideAll(playlist, media, ids, changed = () => {}) {
      const scope = JSON.stringify([playlist,media]);
      if(bulkScopes.has(scope)) return {total:0,done:0,failed:0,providerChanged:false};
      const targets = ids.filter(id => { const r = rows.get(categoryKey(playlist,media,id)); return r?.hidden && !r.saving; });
      const out = {total:targets.length,done:0,failed:0,providerChanged:false};
      bulkScopes.add(scope); changed();
      try {
        for(const id of targets) {
          const row = await this.toggle(playlist,media,id,changed,true);
          if(row && !row.error && !row.hidden) out.done++; else { out.failed++; if(row?.providerChanged){out.providerChanged=true;break;} }
        }
      } finally { bulkScopes.delete(scope); changed(); }
      return out;
    },
    async toggle(playlist, media, id, changed = () => {}, fromBulk = false) {
      const key = categoryKey(playlist,media,id), row = rows.get(key);
      if(!row || row.saving || (!fromBulk && bulkScopes.has(JSON.stringify([playlist,media])))) return;
      const previous = {...row}; row.hidden = !row.hidden; row.saving = true; row.error = false; changed();
      try {
        const result = await write({playlist_id:playlist,media_type:media,category_id:id,hidden:row.hidden,expected_version:row.version,provider_generation:row.provider_generation});
        if(result.status !== 'saved') throw Object.assign(new Error('not_saved'), {result});
        Object.assign(row, {hidden:result.hidden,version:result.version,saving:false});
      } catch(e) {
        Object.assign(row, previous, {saving:false,error:true});
        if(e.result?.status === 'provider_changed') row.providerChanged=true;
        if(e.result?.status === 'conflict') Object.assign(row,{hidden:e.result.hidden,version:e.result.version});
      }
      changed();
      return row;
    },
  };
}
