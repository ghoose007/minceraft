// ==========================================
// MINCECRAFT FIX KIT
// Runtime stability, diagnostics, and safer save/delete guards.
// ==========================================
(function(){
'use strict';
const VERSION='1.0.0', PREFIX='[fix-kit]';
const errorLog=[]; let overlayEl=null, panelEl=null, perfVisible=false, perfTimer=null, wrappersInstalled=false;
function time(){try{return new Date().toLocaleTimeString();}catch(_){return String(Date.now());}}
function strErr(e){if(!e)return'Unknown error'; if(typeof e==='string')return e; return (e.message||String(e))+(e.stack?'\n'+e.stack:'');}
function overlay(){
 // v400: bottom-right runtime error overlay removed. Keep logging to console
 // and keep Fix Kit's reset/save guards, but never create the intrusive panel.
 return null;
}
function reportIssue(e,source){
 const text=(source?source+': ':'')+strErr(e);
 errorLog.push({time:time(),text});
 if(errorLog.length>25)errorLog.shift();
 console.error(PREFIX,text);
}
window.addEventListener('error',ev=>reportIssue(ev.error||(ev.message+' at '+ev.filename+':'+ev.lineno+':'+ev.colno),'window.error'));
window.addEventListener('unhandledrejection',ev=>reportIssue(ev.reason,'unhandled promise rejection'));
function resetStuckInput(){try{ if(typeof keys!=='undefined'&&keys)Object.keys(keys).forEach(k=>keys[k]=false); ['mouseDown','isMouseDown','leftMouseDown','rightMouseDown'].forEach(n=>{try{if(typeof window[n]!=='undefined')window[n]=false;}catch(_){}}); if(typeof touchState!=='undefined'&&touchState)Object.keys(touchState).forEach(k=>{if(typeof touchState[k]==='boolean')touchState[k]=false;}); }catch(e){reportIssue(e,'resetStuckInput');}}
window.addEventListener('blur',resetStuckInput); document.addEventListener('visibilitychange',()=>{if(document.hidden)resetStuckInput();});
function ids(){const s=new Set([0]); try{if(typeof BLOCK_DATA!=='undefined')Object.keys(BLOCK_DATA).forEach(id=>s.add(Number(id))); if(typeof TOOL_DATA!=='undefined')Object.keys(TOOL_DATA).forEach(id=>s.add(Number(id))); if(typeof ITEM_DATA!=='undefined')Object.keys(ITEM_DATA).forEach(id=>s.add(Number(id)));}catch(e){reportIssue(e,'ids');} return s;}
function validateRegistries(){const w=[]; try{const all=ids(); if(typeof BLOCK_DATA!=='undefined')Object.keys(BLOCK_DATA).forEach(raw=>{const id=Number(raw),b=BLOCK_DATA[raw]; if(!b||!b.name)w.push('Block '+id+' is missing a name.'); if(b&&b.dropId!==undefined&&b.dropId!==0&&!all.has(Number(b.dropId)))w.push('Block '+id+' ('+(b.name||'?')+') drops missing id '+b.dropId+'.'); if(b&&b.hardness===undefined)w.push('Block '+id+' ('+(b.name||'?')+') has no hardness.');}); if(typeof RECIPES!=='undefined'&&Array.isArray(RECIPES))RECIPES.forEach((r,i)=>{if(!r||!r.output||!all.has(Number(r.output.id)))w.push('Recipe '+i+' outputs missing id '+(r&&r.output?r.output.id:'?')+'.');}); if(typeof SMELTING_RECIPES!=='undefined'&&Array.isArray(SMELTING_RECIPES))SMELTING_RECIPES.forEach((r,i)=>{if(!r||!all.has(Number(r.input)))w.push('Smelting recipe '+i+' missing input '+(r?r.input:'?')+'.'); if(!r||!all.has(Number(r.output)))w.push('Smelting recipe '+i+' missing output '+(r?r.output:'?')+'.');});}catch(e){reportIssue(e,'validateRegistries');} window.__fixKitRegistryWarnings=w; if(w.length)console.warn(PREFIX,'Registry warnings:',w); else console.log(PREFIX,'Registry validation passed.'); return w;}
function panel(){return null;}
function countArr(name){try{const a=window[name]||(name==='chunkStorageArr'&&typeof chunkStorageArr!=='undefined'?chunkStorageArr:(name==='generatedChunksArr'&&typeof generatedChunksArr!=='undefined'?generatedChunksArr:null)); if(!a)return 0; let n=0; for(let i=0;i<a.length;i++)if(a[i])n++; return n;}catch(_){return 0;}}
function updatePanel(){if(!perfVisible)return; const el=panel(); if(!el)return; let ri=''; try{if(typeof renderer!=='undefined'&&renderer&&renderer.info)ri='\nDraw calls: '+renderer.info.render.calls+'\nTriangles: '+renderer.info.render.triangles+'\nGeometries: '+renderer.info.memory.geometries+'\nTextures: '+renderer.info.memory.textures;}catch(_){} let dirty='?'; try{dirty=(typeof dirtyChunks!=='undefined'&&dirtyChunks)?dirtyChunks.size:'?';}catch(_){} let ents=[]; try{if(typeof mobs!=='undefined'&&mobs)ents.push('Mobs: '+mobs.length);}catch(_){} try{if(typeof droppedItems!=='undefined'&&droppedItems)ents.push('Drops: '+droppedItems.length);}catch(_){} try{if(typeof particles!=='undefined'&&particles)ents.push('Particles: '+particles.length);}catch(_){} const w=window.__fixKitRegistryWarnings||[]; el.textContent='Fix Kit '+VERSION+'  ( toggles)\nFPS: '+(typeof debugFps!=='undefined'?debugFps:'?')+' | Frame: '+(typeof debugFrameTime!=='undefined'&&debugFrameTime.toFixed?debugFrameTime.toFixed(1)+'ms':'?')+'\nDimension: '+(typeof currentDimension!=='undefined'?currentDimension:'?')+'\nChunks loaded: '+countArr('chunkStorageArr')+' / generated: '+countArr('generatedChunksArr')+'\nDirty chunks: '+dirty+(ents.length?'\n'+ents.join(' | '):'')+ri+'\nRegistry warnings: '+w.length+'\nErrors caught: '+errorLog.length;}
function togglePanel(){return;}
// v422: Fix Kit diagnostic UI/keybind removed. Keep save/error guards only.

async function collectSlotRecords(slot){const records=[]; if(typeof openSaveDB!=='function')return records; const db=await openSaveDB(); const tx=db.transaction(SAVE_STORE,'readonly'), store=tx.objectStore(SAVE_STORE); const all=await new Promise((res,rej)=>{const req=store.getAll(); req.onsuccess=()=>res(req.result||[]); req.onerror=rej;}); const pref=slot+'_'; for(const rec of all){if(rec&&(rec.slot===slot||(typeof rec.slot==='string'&&rec.slot.indexOf(pref)===0)))records.push(rec);} return records;}
async function restoreSlotRecords(records){if(!records||!records.length||typeof openSaveDB!=='function')return; const db=await openSaveDB(); const tx=db.transaction(SAVE_STORE,'readwrite'), store=tx.objectStore(SAVE_STORE); for(const rec of records)store.put(rec); await new Promise((res,rej)=>{tx.oncomplete=res; tx.onerror=rej; tx.onabort=rej;});}
async function deleteAllSlotRecords(slot){if(typeof openSaveDB!=='function')return; const db=await openSaveDB(); const tx=db.transaction(SAVE_STORE,'readwrite'), store=tx.objectStore(SAVE_STORE); const keys=await new Promise((res,rej)=>{const req=store.getAllKeys(); req.onsuccess=()=>res(req.result||[]); req.onerror=rej;}); const pref=slot+'_'; for(const key of keys){if(key===slot||(typeof key==='string'&&key.indexOf(pref)===0))store.delete(key);} await new Promise((res,rej)=>{tx.oncomplete=res; tx.onerror=rej; tx.onabort=rej;});}
function installSaveWrappers(){if(wrappersInstalled)return; wrappersInstalled=true; try{if(typeof saveWorld==='function'){const orig=saveWorld; saveWorld=async function(slot){const backup=await collectSlotRecords(slot); try{await orig(slot);}catch(e){console.error(PREFIX,'Save failed; restoring previous slot records.',e); try{await restoreSlotRecords(backup);}catch(re){reportIssue(re,'save restore failed');} throw e;}}; window.saveWorld=saveWorld;}}catch(e){reportIssue(e,'install save wrapper');}
 try{if(typeof deleteSelectedWorld==='function'){deleteSelectedWorld=async function(){if(typeof selectedWorldSlot==='undefined'||selectedWorldSlot<0)return; const save=await dbGet(selectedWorldSlot); if(!save)return; if(!confirm('Delete "'+(save.worldName||('World '+(selectedWorldSlot+1)))+'"? This cannot be undone!'))return; await deleteAllSlotRecords(selectedWorldSlot); selectedWorldSlot=-1; if(typeof updateWorldSelectButtons==='function')updateWorldSelectButtons(); if(typeof renderWorldList==='function')await renderWorldList();}; window.deleteSelectedWorld=deleteSelectedWorld;}}catch(e){reportIssue(e,'install delete wrapper');}}
document.addEventListener('DOMContentLoaded',()=>{
 try {
   const oldPanel = document.getElementById('fix-kit-perf-panel');
   if (oldPanel && oldPanel.parentNode) oldPanel.parentNode.removeChild(oldPanel);
 } catch(_) {}
 validateRegistries();
 installSaveWrappers();
 console.log(PREFIX,'loaded without diagnostic UI.');
});
window.MincecraftFixKit={version:VERSION,errors:errorLog,reportIssue,resetStuckInput,validateRegistries,togglePerfPanel:togglePanel,collectSlotRecords,restoreSlotRecords,deleteAllSlotRecords};
})();
