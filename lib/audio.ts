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

export type CheckinSound =
  | 'two-tone'
  | 'fanfare'
  | 'chime'
  | 'beep'
  | 'success'
  | 'scanner'
  | 'jackpot'
  | 'tada'

export const CHECKIN_SOUNDS: { id: CheckinSound | null; label: string; description: string }[] = [
  { id: null,       label: 'Off',         description: 'No sound' },
  { id: 'two-tone', label: 'Two-Tone',    description: 'Two ascending notes — quick and cheerful' },
  { id: 'fanfare',  label: 'Fanfare',     description: 'Mini three-note fanfare' },
  { id: 'chime',    label: 'Chime',       description: 'Two-note ascending chime' },
  { id: 'beep',     label: 'Beep',        description: 'Clean electronic beep' },
  { id: 'success',  label: 'Success',     description: 'Three-note upbeat tone' },
  { id: 'scanner',  label: 'Scanner',     description: 'Grocery store scanner beep' },
  { id: 'jackpot',  label: 'Jackpot',     description: 'Lottery-style ascending win jingle' },
  { id: 'tada',     label: 'Ta-Da!',      description: 'Uplifting brass-style fanfare' },
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
      case 'two-tone': _twoTone(ctx); break
      case 'fanfare':  _fanfare(ctx); break
      case 'chime':    _chime(ctx);   break
      case 'beep':     _beep(ctx);    break
      case 'success':  _success(ctx); break
      case 'scanner':  _scanner(ctx); break
      case 'jackpot':  _jackpot(ctx); break
      case 'tada':     _tada(ctx);    break
    }
  } catch {
    // swallow — audio errors are non-fatal
  }
}

// ── Helper ────────────────────────────────────────────────────────────────────

function _note(
  ctx: AudioContext,
  type: OscillatorType,
  freq: number,
  startOffset: number,
  duration: number,
  peakGain: number,
  attackTime = 0.02,
): void {
  const t = ctx.currentTime + startOffset
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = type
  osc.frequency.setValueAtTime(freq, t)
  gain.gain.setValueAtTime(0, t)
  gain.gain.linearRampToValueAtTime(peakGain, t + attackTime)
  gain.gain.exponentialRampToValueAtTime(0.001, t + duration)
  osc.start(t)
  osc.stop(t + duration)
}

// ── Sound implementations ─────────────────────────────────────────────────────

/** Two ascending sine tones — C5 then G5, cheerful and quick */
function _twoTone(ctx: AudioContext): void {
  _note(ctx, 'sine', 523, 0,    0.32, 0.45)
  _note(ctx, 'sine', 784, 0.14, 0.32, 0.45)
}

/** Three-note mini fanfare — C5 → G5 → C6, quick staccato */
function _fanfare(ctx: AudioContext): void {
  _note(ctx, 'sine', 523,  0,    0.25, 0.35)
  _note(ctx, 'sine', 784,  0.12, 0.25, 0.35)
  _note(ctx, 'sine', 1046, 0.22, 0.35, 0.35)
}

/** Two-note ascending chime: C5 → E5 */
function _chime(ctx: AudioContext): void {
  _note(ctx, 'sine', 523, 0,    0.35, 0.4)
  _note(ctx, 'sine', 659, 0.18, 0.55, 0.4)
}

/** Short clean electronic beep — square wave at 960 Hz */
function _beep(ctx: AudioContext): void {
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'square'
  osc.frequency.setValueAtTime(960, t)
  gain.gain.setValueAtTime(0.2, t)
  gain.gain.setValueAtTime(0.2, t + 0.12)
  gain.gain.linearRampToValueAtTime(0, t + 0.15)
  osc.start(t)
  osc.stop(t + 0.15)
}

/** Three-note upbeat fanfare — C5 → E5 → G5 */
function _success(ctx: AudioContext): void {
  _note(ctx, 'sine', 523, 0,    0.15, 0.4)
  _note(ctx, 'sine', 659, 0.12, 0.15, 0.4)
  _note(ctx, 'sine', 784, 0.24, 0.5,  0.4)
}

/**
 * Grocery store scanner — single flat square-wave beep, very short.
 * The supermarket "boop": 1 kHz, ~110 ms, hard edges.
 */
function _scanner(ctx: AudioContext): void {
  const t = ctx.currentTime
  const osc = ctx.createOscillator()
  const gain = ctx.createGain()
  osc.connect(gain)
  gain.connect(ctx.destination)
  osc.type = 'square'
  osc.frequency.setValueAtTime(1050, t)
  gain.gain.setValueAtTime(0.18, t)
  gain.gain.setValueAtTime(0.18, t + 0.10)
  gain.gain.linearRampToValueAtTime(0, t + 0.115)
  osc.start(t)
  osc.stop(t + 0.115)
}

/**
 * Lottery jackpot — rapid ascending arpeggio (C5→E5→G5→C6→E6) then
 * a sustained top note with a light shimmer, like a slot machine win.
 */
function _jackpot(ctx: AudioContext): void {
  const arpNotes = [523, 659, 784, 1046, 1318]
  arpNotes.forEach((freq, i) => {
    _note(ctx, 'sine', freq, i * 0.07, 0.14, 0.35)
  })
  // Sustained shimmer on the top note with two harmonics
  const hold = arpNotes.length * 0.07
  ;[[1318, 0.3], [2637, 0.08], [3955, 0.04]].forEach(([freq, amp]) => {
    _note(ctx, 'sine', freq, hold, 0.55, amp, 0.04)
  })
}

/**
 * Ta-Da! — classic two-part brass fanfare.
 * "Ta" = short sawtooth chord stab; "Da" = longer sustained chord that swells.
 */
function _tada(ctx: AudioContext): void {
  // "Ta" — short punchy stab on G4 major (G4, B4, D5)
  ;[392, 494, 587].forEach(freq => {
    _note(ctx, 'sawtooth', freq, 0, 0.18, 0.15, 0.01)
  })
  // Gap then "Da" — full swell on C5 major (C5, E5, G5, C6)
  ;[523, 659, 784, 1046].forEach(freq => {
    _note(ctx, 'sawtooth', freq, 0.22, 0.75, 0.12, 0.06)
  })
}
