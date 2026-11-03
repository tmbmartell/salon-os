const CACHE="salon-os-v212-shell";
const SHELL=["/","/tokens.css","/theme.js","/styles.css","/app.js","/appointment-ui.js","/dashboard-board.js","/agenda-board.js","/manifest.webmanifest","/icon-192.png","/icon-512.png","/logo/novagente-simbolo.svg","/logo/novagente-icone-app.svg","/fonts/figtree-latin-400-normal.woff2","/fonts/figtree-latin-500-normal.woff2","/fonts/figtree-latin-600-normal.woff2","/fonts/figtree-latin-700-normal.woff2","/fonts/instrument-serif-latin-400-normal.woff2"];
self.addEventListener("install",e=>{e.waitUntil(caches.open(CACHE).then(c=>c.addAll(SHELL)).then(()=>self.skipWaiting()))});
self.addEventListener("activate",e=>{e.waitUntil(caches.keys().then(keys=>Promise.all(keys.filter(k=>k!==CACHE).map(k=>caches.delete(k)))).then(()=>self.clients.claim()))});
self.addEventListener("fetch",e=>{
  const u=new URL(e.request.url);
  if(e.request.method!=="GET"||u.origin!==location.origin||u.pathname.startsWith("/api/"))return;
  if(e.request.mode==="navigate"){
    e.respondWith(fetch(e.request).then(r=>{const c=r.clone();caches.open(CACHE).then(x=>x.put("/",c));return r}).catch(()=>caches.match("/")));
    return;
  }
  const codeAsset=["/tokens.css","/theme.js","/app.js","/appointment-ui.js","/dashboard-board.js","/agenda-board.js","/styles.css","/manifest.webmanifest"].includes(u.pathname);
  if(codeAsset){
    e.respondWith(fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return r}).catch(()=>caches.match(e.request)));
    return;
  }
  e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{if(r.ok){const c=r.clone();caches.open(CACHE).then(x=>x.put(e.request,c))}return r})));
});