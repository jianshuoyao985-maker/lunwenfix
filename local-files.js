/* Keep only the latest generated result in this browser, for up to 24 hours. */
"use strict";
window.LunwenLocalFiles=(()=>{
  let dbPromise=null;
  function open() {
    if(!dbPromise)dbPromise=new Promise((resolve,reject)=>{
      const request=indexedDB.open('lunwenfix-local',1);
      request.onupgradeneeded=()=>request.result.createObjectStore('results');
      request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error);
      request.onblocked=()=>reject(new Error('浏览器未开放本地存储'));
    });
    return dbPromise;
  }
  async function transaction(mode,action) {
    const db=await open();return new Promise((resolve,reject)=>{
      const tx=db.transaction('results',mode);const request=action(tx.objectStore('results'));
      tx.oncomplete=()=>resolve(request.result);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存中断'));
    });
  }
  const clear=()=>transaction('readwrite',store=>store.delete('latest'));
  async function latest() {
    const result=await transaction('readonly',store=>store.get('latest'));
    if(!result)return null;
    if(!Number.isFinite(result.expires_at)||result.expires_at<=Date.now()){await clear();return null;}
    return result;
  }
  const save=result=>transaction('readwrite',store=>store.put(result,'latest'));
  return {save,latest,clear};
})();
