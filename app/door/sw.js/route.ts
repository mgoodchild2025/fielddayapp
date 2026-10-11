// Door Alert service worker, served from /door/sw.js so its scope can be
// /door/ (a worker's directory caps its scope). A route handler rather than a
// file in public/: the fixed 'sw.js' segment always beats app/door/[publicToken].
// Registered by components/door/door-push.ts; separate from the root /sw.js.
const SW_SOURCE = `/*
 * Door Alert service worker — scope /door/ only, separate from the app's
 * root /sw.js. Push + notification clicks only: NO fetch handler, nothing is
 * cached (display pages carry live state and tokens).
 *
 * Payloads (lib/door/push.ts):
 *   { type: 'ring', ringId, stationName, visitorName, createdAt, renotify? }
 *   { type: 'ack',  ringId, displayLabel }
 *   { type: 'test', stationName }
 */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

function getDisplayToken() {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open('fieldday-door', 1)
      open.onupgradeneeded = () => open.result.createObjectStore('kv')
      open.onsuccess = () => {
        const req = open.result.transaction('kv').objectStore('kv').get('displayToken')
        req.onsuccess = () => { open.result.close(); resolve(req.result || null) }
        req.onerror = () => resolve(null)
      }
      open.onerror = () => resolve(null)
    } catch (e) {
      resolve(null)
    }
  })
}

// Safari revokes a push subscription whose pushes don't show a notification,
// so on Apple devices an "answered" push replaces the alert instead of only
// closing it.
const IS_APPLE = /iPhone|iPad|iPod|Macintosh/.test(self.navigator.userAgent) && !/Chrome|Android/.test(self.navigator.userAgent)

self.addEventListener('push', (event) => {
  let data = {}
  try { data = event.data ? event.data.json() : {} } catch (e) { data = {} }

  if (data.type === 'ring') {
    const who = data.visitorName ? \`\${data.visitorName} is at the door\` : 'Someone is at the door'
    event.waitUntil(self.registration.showNotification(who, {
      body: \`\${data.stationName}\${data.renotify ? ' · still waiting' : ''} — tap On my way\`,
      tag: \`door-\${data.ringId}\`,
      renotify: true,
      requireInteraction: true,
      vibrate: [400, 150, 400, 150, 800],
      actions: [{ action: 'ack', title: 'On my way' }],
      data: { ringId: data.ringId },
    }))
    return
  }

  if (data.type === 'ack') {
    const tag = \`door-\${data.ringId}\`
    event.waitUntil(self.registration.getNotifications({ tag }).then((list) => {
      list.forEach((n) => n.close())
      if (!IS_APPLE) return
      return self.registration.showNotification('Someone’s on the way', {
        body: data.displayLabel ? \`\${data.displayLabel} is going to the door.\` : 'The door has been answered.',
        tag,
        silent: true,
        data: { ringId: data.ringId, answered: true },
      })
    }))
    return
  }

  if (data.type === 'test') {
    event.waitUntil(self.registration.showNotification('Test alert', {
      body: \`\${data.stationName}: notifications are working on this device.\`,
      tag: 'door-test',
      vibrate: [400, 150, 400],
    }))
    return
  }

  // Unknown payload: still show something (required on iOS).
  event.waitUntil(self.registration.showNotification('Door alert', { tag: 'door-unknown' }))
})

async function openDisplay(token) {
  const url = token ? \`/door/display/\${token}\` : '/door/display'
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  for (const w of windows) {
    if (new URL(w.url).pathname.startsWith('/door/display')) {
      await w.focus()
      return
    }
  }
  await self.clients.openWindow(url)
}

self.addEventListener('notificationclick', (event) => {
  const n = event.notification
  const ringId = n.data && n.data.ringId
  n.close()
  event.waitUntil((async () => {
    const token = await getDisplayToken()
    if (event.action === 'ack' && token && ringId) {
      try {
        const res = await fetch(\`/api/door/display/\${token}/rings/\${ringId}/ack\`, { method: 'POST' })
        if (res.ok) return
      } catch (e) { /* fall through: open the page so they can tap there */ }
    }
    await openDisplay(token)
  })())
})
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
