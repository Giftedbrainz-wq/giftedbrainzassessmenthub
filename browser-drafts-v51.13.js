/* Gifted Brainz v51.13 — local-first, offline browser drafts.
 * Never sends drafts to Supabase or any other network service.
 * IndexedDB is the primary store; localStorage is a same-device recovery copy.
 * Only temporary draft records are eligible for expiry; final server submissions
 * and official grades are deliberately NOT deleted by this utility.
 */
(function(root){
 'use strict';
 const PREFIX='gb:draft-cache:51.13:';
 const DB='giftedbrainz-local-drafts';
 const STORE='drafts';
 const TTL=45*24*60*60*1000;
 const pending=new Map();let dbPromise=null;
 function openDb(){
  if(dbPromise)return dbPromise;
  dbPromise=new Promise(resolve=>{
   if(!root.indexedDB)return resolve(null);
   try{const request=root.indexedDB.open(DB,1);
    request.onupgradeneeded=()=>{if(!request.result.objectStoreNames.contains(STORE))request.result.createObjectStore(STORE,{keyPath:'key'});};
    request.onsuccess=()=>resolve(request.result);
    request.onerror=()=>resolve(null);
    request.onblocked=()=>resolve(null);
   }catch{return resolve(null);}
  });return dbPromise;
 }
 function localRead(key){try{const item=JSON.parse(root.localStorage.getItem(PREFIX+key)||'null');return item?.value??null;}catch{return null;}}
 function localWrite(key,value){try{const text=JSON.stringify({updatedAt:Date.now(),value});if(text.length<1200000)root.localStorage.setItem(PREFIX+key,text);}catch{}}
 function localDelete(key){try{root.localStorage.removeItem(PREFIX+key);}catch{}}
 async function dbWrite(item){const db=await openDb();if(!db)return;
  await new Promise(resolve=>{try{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).put(item);tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;}catch{resolve();}});
 }
 async function dbRemove(key){const db=await openDb();if(!db)return;
  await new Promise(resolve=>{try{const tx=db.transaction(STORE,'readwrite');tx.objectStore(STORE).delete(key);tx.oncomplete=resolve;tx.onerror=resolve;tx.onabort=resolve;}catch{resolve();}});
 }
 async function get(key){
  const db=await openDb();if(db){
   const result=await new Promise(resolve=>{try{const tx=db.transaction(STORE,'readonly');const request=tx.objectStore(STORE).get(key);request.onsuccess=()=>resolve(request.result||null);request.onerror=()=>resolve(null);}catch{resolve(null);}});
   if(result&&Date.now()-(result.updatedAt||0)<TTL)return result.value;
  }
  return localRead(key);
 }
 function save(key,value){
  localWrite(key,value);let entry=pending.get(key);
  if(entry?.timer)clearTimeout(entry.timer);
  entry={key,updatedAt:Date.now(),value};
  entry.timer=setTimeout(()=>{pending.delete(key);void dbWrite({key,updatedAt:entry.updatedAt,value:entry.value});},380);
  pending.set(key,entry);
 }
 function remove(key){const entry=pending.get(key);if(entry?.timer)clearTimeout(entry.timer);pending.delete(key);localDelete(key);void dbRemove(key);}
 function flush(){for(const [key,item] of pending){clearTimeout(item.timer);void dbWrite({key,updatedAt:item.updatedAt,value:item.value});pending.delete(key);}}
 function tidy(){
  try{for(let i=root.localStorage.length-1;i>=0;i--){const key=root.localStorage.key(i);if(!key?.startsWith(PREFIX))continue;
   try{const item=JSON.parse(root.localStorage.getItem(key)||'null');if(!item||Date.now()-(item.updatedAt||0)>TTL)root.localStorage.removeItem(key);}catch{root.localStorage.removeItem(key);}
  }}catch{}
  void openDb().then(db=>{if(!db)return;try{const tx=db.transaction(STORE,'readwrite');const st=tx.objectStore(STORE);const req=st.openCursor();req.onsuccess=()=>{const cursor=req.result;if(!cursor)return;if(Date.now()-(cursor.value.updatedAt||0)>TTL)cursor.delete();cursor.continue();};}catch{}});
 }
 root.GBDrafts={get,getSync:localRead,save,remove,flush,tidy};
 root.addEventListener?.('pagehide',flush);
 root.document?.addEventListener?.('visibilitychange',()=>{if(root.document.visibilityState==='hidden')flush();});
 setTimeout(tidy,2400);
})(typeof window!=='undefined'?window:globalThis);
