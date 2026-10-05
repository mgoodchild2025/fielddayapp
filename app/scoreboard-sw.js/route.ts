// Service worker for the scoreboard — the app's ONLY service worker, and it is
// deliberately registered with scope '/scoreboard' so it never controls (or
// cache-poisons) any other page. Served from a root-level path because a SW
// script's directory caps its scope: /scoreboard/sw.js could only claim
// '/scoreboard/…' (with the slash), which would miss /scoreboard itself.
//
// Strategy: network-first for page navigations with a 3s cap (falling back to
// the cached page — exact URL, then the bare /scoreboard),
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
  event.waitUntil(Promise.all([self.clients.claim(), prune()]));
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

// Offline fallback for a navigation: the exact URL, then the bare board.
// Never "the same page ignoring the query": that returned whichever
// ?game= page happened to be cached first — a board ATTACHED TO ANOTHER GAME,
// whose save would write this game's result onto that one. The bare board
// (unattached) tells the scorekeeper it isn't connected to the game.
function cachedPage(req) {
  return caches.match(req)
    .then((hit) => hit || caches.match('/scoreboard'));
}

// Keep the cache bounded: every deploy adds a new set of chunks and every
// attached board its own page. Oldest entries go first (keys() is in
// insertion order); the bare board is always kept.
const MAX_ENTRIES = 250;
function prune() {
  return caches.open(CACHE).then((c) => c.keys().then((keys) => {
    const extra = keys.length - MAX_ENTRIES;
    if (extra <= 0) return;
    const victims = keys.filter((k) => new URL(k.url).pathname !== '/scoreboard' || new URL(k.url).search !== '').slice(0, extra);
    return Promise.all(victims.map((k) => c.delete(k)));
  })).catch(() => {});
}

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === 'navigate') {
    // Network-first, but don't wait forever: on gym wifi that's connected but
    // not passing traffic, a bare fetch hung 30s+ before the cached copy.
    // A 5xx (a deploy restarting the server) counts as no answer: the
    // cached board beats an error page mid-game.
    const network = fetch(req).then((res) => {
      if (res.ok) {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy)).then(prune);
        return res;
      }
      return res.status >= 500 ? null : res;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, 3000, null));
    event.respondWith(
      Promise.race([network.catch(() => null), timeout]).then((res) =>
        res || cachedPage(req).then((hit) => hit || network.then((r) => r || fetch(req)))
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
