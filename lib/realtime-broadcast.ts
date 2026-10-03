/**
 * Receive-only Supabase Realtime BROADCAST listener over a plain WebSocket.
 *
 * Why not supabase-js: listening for live scores was the only reason the event
 * page, the TV display and the admin bracket shipped the Supabase client
 * (~52KB gz on the most-visited page). Receiving an ephemeral broadcast on a
 * public channel needs very little of it: open the socket, join the topic,
 * heartbeat, and read `broadcast` frames. The SENDER (the scoreboard app)
 * still uses supabase-js — the server speaks the same protocol to both.
 *
 * Protocol (Phoenix channels, JSON serializer vsn 1.0.0), as realtime-js does it:
 *   connect  wss://<ref>.supabase.co/realtime/v1/websocket?apikey=<anon>&vsn=1.0.0
 *   join     {topic:'realtime:<name>', event:'phx_join', payload:{config, access_token}, ref, join_ref}
 *   receive  {topic, event:'broadcast', payload:{type:'broadcast', event, payload}}
 *   beat     {topic:'phoenix', event:'heartbeat', payload:{}, ref} → phx_reply with the same ref
 *
 * Resilience: one socket per page shared by every topic; a heartbeat that
 * isn't answered before the next one closes the socket (dead wifi), and any
 * close while topics remain reconnects with backoff and rejoins them. A
 * channel-level phx_error / phx_close rejoins that topic. Coming back to the
 * tab or back online reconnects at once instead of waiting out the backoff.
 */

export type BroadcastHandler = (event: string, payload: unknown) => void

type WsLike = {
  readyState: number
  send(data: string): void
  close(code?: number, reason?: string): void
  onopen: ((ev: unknown) => void) | null
  onclose: ((ev: unknown) => void) | null
  onerror: ((ev: unknown) => void) | null
  onmessage: ((ev: { data: unknown }) => void) | null
}

export type BroadcastSocketOptions = {
  /** Supabase project URL (https://<ref>.supabase.co) */
  url: string
  /** Public anon key */
  apiKey: string
  WebSocketImpl?: new (url: string) => WsLike
  heartbeatMs?: number
  /** Reconnect delays, last one repeats */
  backoffMs?: number[]
  /** Browser lifecycle hooks (visibility/online). Off in tests and on the server. */
  watchLifecycle?: boolean
}

const OPEN = 1

export function realtimeSocketUrl(url: string, apiKey: string): string {
  return `${url.replace(/^http/, 'ws').replace(/\/$/, '')}/realtime/v1/websocket?apikey=${encodeURIComponent(apiKey)}&vsn=1.0.0`
}

export function createBroadcastSocket(opts: BroadcastSocketOptions) {
  const WS = opts.WebSocketImpl ?? (globalThis.WebSocket as unknown as new (url: string) => WsLike)
  const heartbeatMs = opts.heartbeatMs ?? 25_000
  const backoff = opts.backoffMs ?? [1_000, 2_000, 5_000, 10_000]

  const topics = new Map<string, { handler: BroadcastHandler; joinRef: string }>()
  let ws: WsLike | null = null
  let ref = 0
  let attempt = 0
  let heartbeatTimer: ReturnType<typeof setInterval> | null = null
  let pendingHeartbeat: string | null = null
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null
  const rejoinTimers = new Map<string, ReturnType<typeof setTimeout>>()

  const nextRef = () => String(++ref)
  const full = (topic: string) => `realtime:${topic}`

  function send(msg: Record<string, unknown>) {
    if (ws && ws.readyState === OPEN) ws.send(JSON.stringify(msg))
  }

  function join(topic: string) {
    const t = topics.get(topic)
    if (!t) return
    const r = nextRef()
    t.joinRef = r
    send({
      topic: full(topic),
      event: 'phx_join',
      payload: {
        config: {
          broadcast: { ack: false, self: false },
          presence: { key: '', enabled: false },
          postgres_changes: [],
          private: false,
        },
        access_token: opts.apiKey,
      },
      ref: r,
      join_ref: r,
    })
  }

  function stopHeartbeat() {
    if (heartbeatTimer) clearInterval(heartbeatTimer)
    heartbeatTimer = null
    pendingHeartbeat = null
  }

  function startHeartbeat() {
    stopHeartbeat()
    heartbeatTimer = setInterval(() => {
      if (pendingHeartbeat) {
        // The last beat was never answered: the connection is dead even if
        // the browser hasn't noticed. Close it; onclose reconnects.
        pendingHeartbeat = null
        ws?.close(1000, 'heartbeat timeout')
        return
      }
      pendingHeartbeat = nextRef()
      send({ topic: 'phoenix', event: 'heartbeat', payload: {}, ref: pendingHeartbeat })
    }, heartbeatMs)
  }

  function scheduleReconnect(delay?: number) {
    if (reconnectTimer || topics.size === 0) return
    const wait = delay ?? backoff[Math.min(attempt, backoff.length - 1)]
    attempt++
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null
      connect()
    }, wait)
  }

  function connect() {
    if (ws || topics.size === 0) return
    let socket: WsLike
    try {
      socket = new WS(realtimeSocketUrl(opts.url, opts.apiKey))
    } catch {
      scheduleReconnect()
      return
    }
    ws = socket
    socket.onopen = () => {
      attempt = 0
      startHeartbeat()
      for (const topic of topics.keys()) join(topic)
    }
    socket.onmessage = (ev) => {
      let msg: { topic?: string; event?: string; payload?: unknown; ref?: string | null }
      try { msg = JSON.parse(String(ev.data)) } catch { return }
      if (msg.topic === 'phoenix') {
        if (msg.event === 'phx_reply' && msg.ref === pendingHeartbeat) pendingHeartbeat = null
        return
      }
      const name = msg.topic?.startsWith('realtime:') ? msg.topic.slice('realtime:'.length) : null
      const t = name ? topics.get(name) : undefined
      if (!name || !t) return
      if (msg.event === 'broadcast') {
        const p = msg.payload as { event?: string; payload?: unknown } | undefined
        if (p?.event) t.handler(p.event, p.payload)
      } else if (msg.event === 'phx_error' || msg.event === 'phx_close') {
        // The channel dropped (server restart, kicked): rejoin it shortly.
        if (rejoinTimers.has(name)) return
        rejoinTimers.set(name, setTimeout(() => { rejoinTimers.delete(name); join(name) }, 1_000))
      }
    }
    socket.onerror = () => { /* onclose follows */ }
    socket.onclose = () => {
      if (ws !== socket) return
      ws = null
      stopHeartbeat()
      scheduleReconnect()
    }
  }

  function reconnectNow() {
    if (topics.size === 0) return
    if (ws && ws.readyState === OPEN) return
    if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
    if (ws) return // still connecting
    attempt = 0
    connect()
  }

  if (opts.watchLifecycle && typeof window !== 'undefined') {
    window.addEventListener('online', reconnectNow)
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible') reconnectNow()
    })
  }

  return {
    /** Listen to broadcasts on `topic`; returns the unsubscribe. One handler per topic. */
    subscribe(topic: string, handler: BroadcastHandler): () => void {
      topics.set(topic, { handler, joinRef: '' })
      if (!ws) connect()
      else if (ws.readyState === OPEN) join(topic)
      return () => {
        const t = topics.get(topic)
        if (!t || t.handler !== handler) return
        send({ topic: full(topic), event: 'phx_leave', payload: {}, ref: nextRef(), join_ref: t.joinRef })
        topics.delete(topic)
        const rj = rejoinTimers.get(topic)
        if (rj) { clearTimeout(rj); rejoinTimers.delete(topic) }
        if (topics.size === 0) {
          if (reconnectTimer) { clearTimeout(reconnectTimer); reconnectTimer = null }
          stopHeartbeat()
          const s = ws
          ws = null
          s?.close(1000, 'no topics')
        }
      }
    },
    /** Test/debug: is the socket open right now? */
    isOpen: () => !!ws && ws.readyState === OPEN,
  }
}
