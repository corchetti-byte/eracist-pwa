const CACHE='veracist-pwa-v1.0.0';
const SHELL=['./','./index.html','./manifest.webmanifest','./offline.html','./icons/icon-192.png','./icons/icon-512.png','./icons/icon-maskable-512.png','./icons/apple-touch-icon.png'];
self.addEventListener('install',event=>{event.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()));});
self.addEventListener('activate',event=>{event.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()));});
self.addEventListener('fetch',event=>{
  if(event.request.method!=='GET') return;
  event.respondWith(fetch(event.request).then(resp=>{
    const copy=resp.clone(); caches.open(CACHE).then(c=>c.put(event.request,copy)); return resp;
  }).catch(()=>caches.match(event.request).then(hit=>hit||caches.match('./index.html').then(app=>app||caches.match('./offline.html')))));
});
