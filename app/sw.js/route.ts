// Root service worker — scope '/', registered by components/pwa/pwa-registrar.tsx
// on every org site. It exists for Web Push (and the home-screen badge that
// rides along with it); it deliberately has NO fetch handler, so it can never
// cache or serve a stale authenticated page. The scoreboard keeps its own
// offline-capable worker at /scoreboard-sw.js (scope '/scoreboard' — the more
// specific scope wins there, so the two never fight).
//
// Served as a route handler because the org-branded manifest is too, and so
// the script lives at a root path whose directory allows scope '/'.
const SW_SOURCE = `
self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

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

// The push service rotated the subscription — re-subscribe with the same key
// and tell the server (a worker can't call a Server Action, hence the route).
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
