/**
 * Check-in audio utilities.
 *
 * All sounds are generated via the Web Audio API — no external files needed.
 *
 * iOS Safari blocks AudioContext playback until a user gesture has occurred.
 * Call `unlockAudio()` inside any user-gesture handler (button click, key press)
 * before the first sound is needed.  After that, `playCheckinSound()` works
 * even when triggered programmatically (e.g. on a successful QR scan).
 */

export type CheckinSound = 'ding' | 'chime' | 'beep' | 'success' | 'airhorn'

export const CHECKIN_SOUNDS: { id: CheckinSound | null; label: string; description: string }[] = [
  { id: null,       label: 'Off',      description: 'No sound' },
  { id: 'ding',     label: 'Ding',     description: 'Soft bell — gentle single note' },
  { id: 'chime',    label: 'Chime',    description: 'Two-note ascending chime' },
  { id: 'beep',     label: 'Beep',     description: 'Clean electronic beep' },
  { id: 'success',  label: 'Success',  description: 'Three-note upbeat tone' },
  { id: 'airhorn',  label: 'Air Horn', description: 'Party airhorn blast' },
]

// ── Singleton AudioContext ────────────────────────────────────────────────────

let _ctx: AudioContext | null = null

function getCtx(): AudioContext | null {
  if (typeof window === 'undefined') return null
  if (_ctx) return _ctx
  try {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const AudioCtx = window.AudioContext ?? (window as any).webkitAudioContext
    if (!AudioCtx) return null
    _ctx = new AudioCtx()
  } catch {
    return null
  }
  return _ctx
}

/**
 * Call this inside a user gesture (button onClick / keydown) to unlock the
 * AudioContext on iOS Safari.  Safe to call multiple times.
 */
export function unlockAudio(): void {
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    ctx.resume().catch(() => undefined)
  }
  // Play a completely silent buffer — this satisfies the iOS gesture requirement
  try {
    const buf = ctx.createBuffer(1, 1, ctx.sampleRate)
    const src = ctx.createBufferSource()
    src.buffer = buf
    src.connect(ctx.destination)
    src.start(0)
  } catch {
    // ignore
  }
}

// ── Public API ────────────────────────────────────────────────────────────────

export function playCheckinSound(sound: string | null | undefined): void {
  if (!sound) return
  const ctx = getCtx()
  if (!ctx) return
  if (ctx.state === 'suspended') {
    ctx.resume().then(() => _play(ctx, sound)).catch(() => undefined)
    return
  }
  _play(ctx, sound)
}

// ── Internal sound implementations ───────────────────────────────────────────

function _play(ctx: AudioContext, sound: string): void {
  try {
    switch (sound) {
      case 'ding':    _ding(ctx);    break
      case 'chime':   _chime(ctx);   break
      case 'beep':    _beep(ctx);    break
      case 'success': _success(ctx); break
      case 'airhorn': _airhorn(ctx); break
    }
  } catch {
    // swallow — audio errors are non-fatal
  }
}

/** Soft single bell — 880 Hz sine with slow exponential decay */
function _ding(ctx: AudioContext): void {
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'sine'
  osc.frequency.setValueAtTime(880, t)
  osc.frequency.exponentialRampToValueAtTime(440, t + 0.6)
  gain.gain.setValueAtTime(0.5, t)
  gain.gain.exponentialRampToValueAtTime(0.001, t + 0.6)
  osc.start(t)
  osc.stop(t + 0.6)
}

/** Two-note ascending chime: C5 (523 Hz) → E5 (659 Hz) */
function _chime(ctx: AudioContext): void {
  const t = ctx.currentTime
  const notes = [
    { freq: 523, start: 0,    end: 0.35 },
    { freq: 659, start: 0.18, end: 0.55 },
  ]
  for (const n of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(n.freq, t + n.start)
    gain.gain.setValueAtTime(0, t + n.start)
    gain.gain.linearRampToValueAtTime(0.4, t + n.start + 0.02)
    gain.gain.exponentialRampToValueAtTime(0.001, t + n.end)
    osc.start(t + n.start)
    osc.stop(t + n.end)
  }
}

/** Short electronic beep — 1 kHz square wave */
function _beep(ctx: AudioContext): void {
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'square'
  osc.frequency.setValueAtTime(1000, t)
  gain.gain.setValueAtTime(0.25, t)
  gain.gain.setValueAtTime(0.25, t + 0.14)
  gain.gain.linearRampToValueAtTime(0, t + 0.17)
  osc.start(t)
  osc.stop(t + 0.17)
}

/** Three-note success fanfare — C5 → E5 → G5 */
function _success(ctx: AudioContext): void {
  const t = ctx.currentTime
  const notes = [
    { freq: 523, start: 0,    end: 0.15 },
    { freq: 659, start: 0.12, end: 0.27 },
    { freq: 784, start: 0.24, end: 0.5  },
  ]
  for (const n of notes) {
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.connect(gain)
    gain.connect(ctx.destination)
    osc.type = 'sine'
    osc.frequency.setValueAtTime(n.freq, t + n.start)
    gain.gain.setValueAtTime(0, t + n.start)
    gain.gain.linearRampToValueAtTime(0.4, t + n.start + 0.015)
    gain.gain.exponentialRampToValueAtTime(0.001, t + n.end)
    osc.start(t + n.start)
    osc.stop(t + n.end)
  }
}

/** Air horn — sawtooth with pitch-drop and amplitude wobble */
function _airhorn(ctx: AudioContext): void {
  const t = ctx.currentTime
  const dur = 0.5

  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)

  osc.type = 'sawtooth'
  osc.frequency.setValueAtTime(320, t)
  osc.frequency.exponentialRampToValueAtTime(180, t + dur)

  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(0.55, t + 0.02)
  gain.gain.setValueAtTime(0.55, t + dur - 0.05)
  gain.gain.linearRampToValueAtTime(0, t + dur)

  osc.start(t)
  osc.stop(t + dur)
}
