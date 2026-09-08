// Root service worker — scope '/', registered by components/pwa/pwa-registrar.tsx
// on every org site for logged-in users. Responsibilities:
//
//   1. Web Push + the home-screen badge (push / notificationclick /
//      pushsubscriptionchange → /api/push/subscribe).
//   2. Offline reads of a small allowlist of pages (/dashboard, /schedule,
//      /standings): network-first, the last good copy served only when the
//      network fails. Never caches redirects (a /login bounce = signed out) and
//      drops the page cache on sign-out (message from the logout forms) or
//      whenever a navigation comes back redirected. Hashed /_next/static assets
//      are cache-first (immutable by construction).
//   3. Web Share Target: the manifest posts shared photos/videos to
//      /share/inbox; this worker intercepts the POST, parks the files in the
//      Cache API and redirects to /share, where the page uploads them to the
//      chosen event. app/share/inbox/route.ts is the server fallback when the
//      worker isn't controlling yet.
//
// Scoreboard keeps its own offline worker at /scoreboard-sw.js (scope
// '/scoreboard' — the more specific scope wins there, so the two never fight).
const SW_SOURCE = `
const APP_CACHE = 'fieldday-app-v1';
const SHARE_CACHE = 'fieldday-share-inbox';
const OFFLINE_PAGES = ['/dashboard', '/schedule', '/standings'];

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(Promise.all([
    self.clients.claim(),
    caches.keys().then((keys) => Promise.all(
      keys.filter((k) => k.startsWith('fieldday-app-') && k !== APP_CACHE).map((k) => caches.delete(k))
    )),
  ]));
});

// ── Push + badge ─────────────────────────────────────────────────────────────
function setBadge(count) {
  if (typeof count !== 'number' || !self.navigator || !('setAppBadge' in self.navigator)) return Promise.resolve();
  return (count > 0 ? self.navigator.setAppBadge(count) : self.navigator.clearAppBadge()).catch(() => {});
}

self.addEventListener('push', (event) => {
  let p = {};
  try { p = event.data ? event.data.json() : {}; } catch (e) { p = { title: event.data ? event.data.text() : '' }; }
  const title = p.title || 'Fieldday';
  const options = {
    body: p.body || '',
    tag: p.tag || undefined,
    data: { href: p.href || '/dashboard' },
    icon: '/Fieldday-Icon.png',
    badge: '/Fieldday-Icon.png',
  };
  event.waitUntil(Promise.all([
    self.registration.showNotification(title, options),
    setBadge(p.badge),
  ]).catch(() => {}));
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const href = (event.notification.data && event.notification.data.href) || '/dashboard';
  const target = new URL(href, self.location.origin).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      const mine = list.find((c) => new URL(c.url).origin === self.location.origin);
      if (mine) {
        const focus = () => mine.focus();
        return 'navigate' in mine ? mine.navigate(target).then(focus, focus) : focus();
      }
      return self.clients.openWindow(target);
    })
  );
});

self.addEventListener('pushsubscriptionchange', (event) => {
  const old = event.oldSubscription;
  const key = old && old.options && old.options.applicationServerKey;
  if (!key) return;
  event.waitUntil(
    self.registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key })
      .then((sub) => fetch('/api/push/subscribe', {
        method: 'POST',
        credentials: 'include',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ subscription: sub.toJSON(), userAgent: self.navigator.userAgent }),
      }))
      .catch(() => {})
  );
});

// ── Sign-out: forget every cached page ───────────────────────────────────────
self.addEventListener('message', (event) => {
  if (event.data && event.data.type === 'clear-cache') {
    event.waitUntil ? event.waitUntil(caches.delete(APP_CACHE)) : caches.delete(APP_CACHE);
  }
});

// ── Offline pages + share target ─────────────────────────────────────────────
const OFFLINE_HTML = '<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Offline</title>' +
  '<body style="font-family:system-ui,sans-serif;margin:0;min-height:100dvh;display:grid;place-items:center;background:#f8fafc;color:#111">' +
  '<div style="text-align:center;padding:32px;max-width:360px"><div style="font-size:40px">📶</div><h1 style="font-size:20px;margin:12px 0 6px">You&rsquo;re offline</h1>' +
  '<p style="color:#555;font-size:14px;line-height:1.5">This page hasn&rsquo;t been saved for offline use yet. Your schedule and standings are kept after you open them once online.</p>' +
  '<p style="margin-top:16px"><a href="/schedule" style="color:#2563eb;font-size:14px">My schedule</a> &nbsp;·&nbsp; <a href="/standings" style="color:#2563eb;font-size:14px">Standings</a></p>' +
  '<p style="margin-top:12px"><a href="" onclick="location.reload();return false" style="color:#555;font-size:13px">Try again</a></p></div></body>';

function offlineResponse() {
  return new Response(OFFLINE_HTML, { status: 503, headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' } });
}

async function shareTarget(req) {
  try {
    const fd = await req.formData();
    const files = fd.getAll('media').filter((f) => f && typeof f === 'object' && 'size' in f && f.size > 0);
    const cache = await caches.open(SHARE_CACHE);
    const existing = await cache.match('/share-inbox/index').then((r) => (r ? r.json() : [])).catch(() => []);
    const text = String(fd.get('text') || fd.get('title') || '').slice(0, 500);
    for (const f of files) {
      const id = Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
      await cache.put(new Request('/share-inbox/' + id), new Response(f, { headers: { 'content-type': f.type || 'application/octet-stream' } }));
      existing.push({ id, name: f.name || 'shared', type: f.type || '', size: f.size, text });
    }
    await cache.put(new Request('/share-inbox/index'), new Response(JSON.stringify(existing), { headers: { 'content-type': 'application/json' } }));
    return Response.redirect('/share', 303);
  } catch (e) {
    return Response.redirect('/share?error=1', 303);
  }
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  // Web Share Target POST — park the files, send the app to /share.
  if (req.method === 'POST' && url.pathname === '/share/inbox') {
    event.respondWith(shareTarget(req));
    return;
  }
  if (req.method !== 'GET') return;

  // Hashed build assets: cache-first.
  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.match(req).then((hit) => hit || fetch(req).then((res) => {
        if (res.ok) { const copy = res.clone(); caches.open(APP_CACHE).then((c) => c.put(req, copy)); }
        return res;
      }))
    );
    return;
  }

  // Allowlisted pages: network-first, last good copy when offline.
  if (req.mode === 'navigate' && OFFLINE_PAGES.includes(url.pathname)) {
    const key = new Request(url.pathname); // ignore query strings
    event.respondWith(
      fetch(req).then((res) => {
        if (res.redirected || res.status === 401 || res.status === 403) {
          // Signed out (or lost access): nothing cached may outlive the session.
          caches.delete(APP_CACHE);
        } else if (res.ok && res.type === 'basic') {
          const copy = res.clone();
          caches.open(APP_CACHE).then((c) => c.put(key, copy));
        }
        return res;
      }).catch(() => caches.match(key).then((hit) => hit || offlineResponse()))
    );
    return;
  }

  // Any other navigation: network, else the offline page (never a stale copy).
  if (req.mode === 'navigate') {
    event.respondWith(fetch(req).catch(() => offlineResponse()));
  }
});
`

export function GET() {
  return new Response(SW_SOURCE, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // Browsers re-check the worker script on navigation; keep it fresh.
      'Cache-Control': 'no-cache',
    },
  })
}
