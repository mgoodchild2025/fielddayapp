// Service worker for the scoreboard — the app's ONLY service worker, and it is
// deliberately registered with scope '/scoreboard' so it never controls (or
// cache-poisons) any other page. Served from a root-level path because a SW
// script's directory caps its scope: /scoreboard/sw.js could only claim
// '/scoreboard/…' (with the slash), which would miss /scoreboard itself.
//
// Strategy: network-first for page navigations with a 3s cap (falling back to
// the cached page — exact URL, same page ignoring the query, then /scoreboard),
// stale-while-revalidate for same-origin subresources. The board is precached
// on install and the page posts the chunks it loaded before the worker took
// control, so a FIRST online visit is enough to open with no signal.
const SW_SOURCE = `
const CACHE = 'fieldday-scoreboard-v1';

// Precache the board itself on install, so even a first launch can fall back.
self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE).then((c) => c.add('/scoreboard')).catch(() => {}).then(() => self.skipWaiting())
  );
});
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

// The page posts the URLs it loaded before this worker was in control.
self.addEventListener('message', (event) => {
  const data = event.data || {};
  if (data.type !== 'cache-urls' || !Array.isArray(data.urls)) return;
  event.waitUntil(caches.open(CACHE).then((c) => Promise.all(
    data.urls.slice(0, 200).map((u) => {
      const url = new URL(u, self.location.origin);
      if (url.origin !== self.location.origin) return null;
      return c.match(url.href).then((hit) => hit || fetch(url.href).then((res) => res.ok ? c.put(url.href, res) : null).catch(() => null));
    })
  )));
});

// Offline fallback for a navigation: the exact URL, then the same page with
// any ?game= / ?match= query, then the bare board.
function cachedPage(req) {
  return caches.match(req)
    .then((hit) => hit || caches.match(req, { ignoreSearch: true }))
    .then((hit) => hit || caches.match('/scoreboard'));
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network-first, but don't wait forever: on gym wifi that's connected but
    // not passing traffic, a bare fetch hung 30s+ before the cached copy.
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
      }
      return res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000, null));
    event.respondWith(
      Promise.race([network.catch(() => null), timeout]).then((res) =>
        res || cachedPage(req).then((hit) => hit || network)
      ).catch(() => cachedPage(req).then((hit) => hit || Response.error()))
    );
    return;
  }

  // Subresources (JS/CSS/fonts/images): serve cache, refresh in the background.
  event.respondWith(
    caches.match(req).then((hit) => {
      const refresh = fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => hit);
      return hit || refresh;
    })
  );
});
`

export function GET() {
  return new Response(SW_SOURCE, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      // Never let an old worker linger — the script itself is tiny.
      'Cache-Control': 'no-cache',
    },
  })
}
