// Service worker: installable app + push notifications (red number on the app icon).
// Network-first, same-origin only (Firebase / Firestore traffic is never touched).
const CACHE = 'primogem-v1';
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', e => e.waitUntil(self.clients.claim()));
self.addEventListener('fetch', e => {
  const req = e.request;
  if (req.method !== 'GET') return;
  if (new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req).then(res => {
      const copy = res.clone();
      caches.open(CACHE).then(c => c.put(req, copy)).catch(() => {});
      return res;
    }).catch(() => caches.match(req))
  );
});

/* ---------------- push ---------------- */
// the badge number lives in Cache Storage so it survives the worker being stopped
async function getBadge() {
  try { const r = await (await caches.open('pb-state')).match('./__badge'); return r ? (parseInt(await r.text(), 10) || 0) : 0; }
  catch (e) { return 0; }
}
async function putBadge(n) {
  n = Math.max(0, n | 0);
  try { await (await caches.open('pb-state')).put('./__badge', new Response(String(n))); } catch (e) {}
  try { if (n > 0) await self.navigator.setAppBadge(n); else await self.navigator.clearAppBadge(); } catch (e) {}
}

self.addEventListener('push', e => {
  e.waitUntil((async () => {
    let raw = {};
    try { raw = e.data ? e.data.json() : {}; } catch (_) { try { raw = { data: { body: e.data.text() } }; } catch (__) {} }
    const d = Object.assign({}, raw.notification || {}, raw.data || {});
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    const visible = wins.some(w => w.visibilityState === 'visible');
    // every push shows a notification (required on iPhone); silent when the app is already on screen.
    // same tag as the in-app list item, so the same event never shows twice
    await self.registration.showNotification(d.title || 'Primogem Besties', {
      body: d.body || '',
      tag: d.tag || undefined,
      icon: 'apple-touch-icon.png',
      badge: 'apple-touch-icon.png',
      silent: visible,
      data: { url: d.url || './' }
    });
    if (!visible) await putBadge((await getBadge()) + 1);   // red number on the app icon
  })());
});

self.addEventListener('notificationclick', e => {
  e.notification.close();
  e.waitUntil((async () => {
    const wins = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const w of wins) { if ('focus' in w) { await w.focus(); return; } }
    await self.clients.openWindow((e.notification.data && e.notification.data.url) || './');
  })());
});

// the page tells us how many unread items it has (so the icon number is always right)
self.addEventListener('message', e => {
  const m = e.data || {};
  if (m.type === 'badge') e.waitUntil(putBadge(Number(m.n) || 0));
});
