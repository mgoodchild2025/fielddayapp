// Service worker for the scoreboard — the app's ONLY service worker, and it is
// deliberately registered with scope '/scoreboard' so it never controls (or
// cache-poisons) any other page. Served from a root-level path because a SW
// script's directory caps its scope: /scoreboard/sw.js could only claim
// '/scoreboard/…' (with the slash), which would miss /scoreboard itself.
//
// Strategy: network-first for page navigations (falling back to the cached
// shell offline), stale-while-revalidate for same-origin subresources. After
// one online visit the scoreboard opens with no signal at all.
const SW_SOURCE = `
const CACHE = 'fieldday-scoreboard-v1';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    event.respondWith(
      fetch(req)
        .then((res) => {
          if (res.ok) {
            const copy = res.clone();
            caches.open(CACHE).then((c) => c.put(req, copy));
          }
          return res;
        })
        .catch(() => caches.match(req).then((hit) => hit || Response.error()))
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
