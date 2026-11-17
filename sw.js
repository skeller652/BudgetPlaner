'use strict';
const VERSION='6.0.1';
const PREFIX='mein-budget-shell-';
const CACHE=PREFIX+VERSION;
const FILES=['./','./index.html','./style.css?v=6.0.1','./core.js?v=6.0.1','./app.js?v=6.0.1','./manifest.webmanifest','./icons/icon-180.png','./icons/icon-192.png','./icons/icon-512.png'];
self.addEventListener('install',event=>{
  // Vollständige Shell atomar laden. Bei einem fehlenden Asset bleibt die alte Version aktiv.
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(FILES)));
});
self.addEventListener('message',event=>{if(event.data?.type==='SKIP_WAITING')self.skipWaiting();});
self.addEventListener('activate',event=>{
  event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>(k.startsWith(PREFIX)||k.startsWith('budgetplaner-v'))&&k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));
});
self.addEventListener('fetch',event=>{
  const req=event.request,url=new URL(req.url);
  if(req.method!=='GET'||url.origin!==self.location.origin)return;
  // Nur eigene App-Shell, keine fremden Daten oder beliebige Antworten zwischenspeichern.
  const path=self.registration.scope;
  const isNavigation=req.mode==='navigate'&&url.href.startsWith(path);
  const known=FILES.some(f=>new URL(f,path).href===url.href);
  if(!isNavigation&&!known)return;
  event.respondWith(caches.open(CACHE).then(async cache=>{
    const hit=await cache.match(isNavigation?'./index.html':req);
    return hit||fetch(req);
  }));
});
