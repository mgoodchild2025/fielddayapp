import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { createBroadcastSocket, realtimeSocketUrl } from './realtime-broadcast'

// Fake WebSocket: records sent frames, lets the test open/close it and push
// server frames.
class FakeWS {
  static all: FakeWS[] = []
  readyState = 0
  sent: { topic: string; event: string; ref?: string; payload?: unknown }[] = []
  onopen: ((ev: unknown) => void) | null = null
  onclose: ((ev: unknown) => void) | null = null
  onerror: ((ev: unknown) => void) | null = null
  onmessage: ((ev: { data: unknown }) => void) | null = null
  closed = false
  constructor(public url: string) { FakeWS.all.push(this) }
  send(d: string) { this.sent.push(JSON.parse(d)) }
  close() { if (this.closed) return; this.closed = true; this.readyState = 3; this.onclose?.({}) }
  open() { this.readyState = 1; this.onopen?.({}) }
  push(msg: object) { this.onmessage?.({ data: JSON.stringify(msg) }) }
  drop() { this.readyState = 3; this.onclose?.({}) } // server/network side
  events(name: string) { return this.sent.filter((m) => m.event === name) }
}

const make = () => createBroadcastSocket({
  url: 'https://abc.supabase.co',
  apiKey: 'anon',
  WebSocketImpl: FakeWS,
  heartbeatMs: 1000,
  backoffMs: [100, 500],
})
const last = () => FakeWS.all[FakeWS.all.length - 1]

beforeEach(() => { FakeWS.all = []; vi.useFakeTimers() })
afterEach(() => { vi.useRealTimers() })

describe('realtimeSocketUrl', () => {
  it('builds the realtime websocket URL', () => {
    expect(realtimeSocketUrl('https://abc.supabase.co/', 'k e y')).toBe('wss://abc.supabase.co/realtime/v1/websocket?apikey=k%20e%20y&vsn=1.0.0')
  })
})

describe('createBroadcastSocket', () => {
  it('connects lazily, joins on open, and delivers broadcasts to the right topic', () => {
    const s = make()
    expect(FakeWS.all).toHaveLength(0)
    const a = vi.fn(), b = vi.fn()
    s.subscribe('scoreboard:A', a)
    s.subscribe('scoreboard:B', b)
    expect(FakeWS.all).toHaveLength(1) // one socket for both topics
    last().open()
    const joins = last().events('phx_join')
    expect(joins.map((j) => j.topic)).toEqual(['realtime:scoreboard:A', 'realtime:scoreboard:B'])
    expect(joins[0].payload).toMatchObject({ config: { broadcast: { self: false }, private: false }, access_token: 'anon' })

    last().push({ topic: 'realtime:scoreboard:A', event: 'broadcast', payload: { type: 'broadcast', event: 'score', payload: { gameId: 'g1', a: 3 } } })
    expect(a).toHaveBeenCalledWith('score', { gameId: 'g1', a: 3 })
    expect(b).not.toHaveBeenCalled()
  })

  it('joins a topic added after the socket is open straight away', () => {
    const s = make()
    s.subscribe('scoreboard:A', vi.fn())
    last().open()
    s.subscribe('scoreboard:B', vi.fn())
    expect(last().events('phx_join').map((j) => j.topic)).toContain('realtime:scoreboard:B')
  })

  it('heartbeats, and an answered beat keeps the socket', () => {
    const s = make()
    s.subscribe('scoreboard:A', vi.fn())
    const ws = last(); ws.open()
    vi.advanceTimersByTime(1000)
    const beat = ws.events('heartbeat')[0]
    expect(beat.topic).toBe('phoenix')
    ws.push({ topic: 'phoenix', event: 'phx_reply', payload: { status: 'ok' }, ref: beat.ref })
    vi.advanceTimersByTime(1000)
    expect(ws.closed).toBe(false)
    expect(ws.events('heartbeat')).toHaveLength(2)
  })

  it('an unanswered beat closes the dead socket, then reconnects and rejoins', () => {
    const s = make()
    const h = vi.fn()
    s.subscribe('scoreboard:A', h)
    const first = last(); first.open()
    vi.advanceTimersByTime(1000) // beat sent
    vi.advanceTimersByTime(1000) // no reply → close
    expect(first.closed).toBe(true)
    vi.advanceTimersByTime(100)  // backoff
    expect(FakeWS.all).toHaveLength(2)
    last().open()
    expect(last().events('phx_join').map((j) => j.topic)).toEqual(['realtime:scoreboard:A'])
    last().push({ topic: 'realtime:scoreboard:A', event: 'broadcast', payload: { event: 'score', payload: { gameId: 'g' } } })
    expect(h).toHaveBeenCalledTimes(1)
  })

  it('backs off on repeated failures and resets after a good connection', () => {
    const s = make()
    s.subscribe('scoreboard:A', vi.fn())
    last().drop()
    vi.advanceTimersByTime(99); expect(FakeWS.all).toHaveLength(1)
    vi.advanceTimersByTime(1);  expect(FakeWS.all).toHaveLength(2)
    last().drop()
    vi.advanceTimersByTime(499); expect(FakeWS.all).toHaveLength(2)
    vi.advanceTimersByTime(1);   expect(FakeWS.all).toHaveLength(3)
    last().open(); last().drop()
    vi.advanceTimersByTime(100); expect(FakeWS.all).toHaveLength(4) // reset to the first delay
  })

  it('rejoins a channel the server errored or closed', () => {
    const s = make()
    s.subscribe('scoreboard:A', vi.fn())
    const ws = last(); ws.open()
    ws.push({ topic: 'realtime:scoreboard:A', event: 'phx_error', payload: {} })
    vi.advanceTimersByTime(1000)
    expect(ws.events('phx_join')).toHaveLength(2)
  })

  it('leaves on unsubscribe and closes the socket with the last topic — no reconnect', () => {
    const s = make()
    const offA = s.subscribe('scoreboard:A', vi.fn())
    const offB = s.subscribe('scoreboard:B', vi.fn())
    const ws = last(); ws.open()
    offA()
    expect(ws.events('phx_leave').map((m) => m.topic)).toEqual(['realtime:scoreboard:A'])
    expect(ws.closed).toBe(false)
    offB()
    expect(ws.closed).toBe(true)
    vi.advanceTimersByTime(10_000)
    expect(FakeWS.all).toHaveLength(1)
  })

  it('ignores junk and frames for unknown topics', () => {
    const s = make()
    const h = vi.fn()
    s.subscribe('scoreboard:A', h)
    const ws = last(); ws.open()
    ws.onmessage?.({ data: 'not json' })
    ws.push({ topic: 'realtime:scoreboard:Z', event: 'broadcast', payload: { event: 'score', payload: {} } })
    ws.push({ topic: 'realtime:scoreboard:A', event: 'presence_state', payload: {} })
    expect(h).not.toHaveBeenCalled()
  })
})
