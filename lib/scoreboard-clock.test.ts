import { describe, expect, it } from 'vitest'
import {
  DEFAULT_CLOCK, displayMs, endTimeout, formatClock, freshClock, isExpired, isRunning, newPeriod,
  nextAlarm, pause, readClock, remaining, setLength, setMode, start, startTimeout, stopClock,
  timeoutRemaining, toggle, type GameClock,
} from './scoreboard-clock'

// Mirrors ios/ScoreboardKit/Tests/ScoreboardKitTests/GameClockTests.swift.

const countdown = (minutes = 20): GameClock => setLength(setMode(DEFAULT_CLOCK, 'countdown'), minutes)

describe('game clock', () => {
  it('runs from timestamps and pauses', () => {
    let c = start(countdown(10), 1_000)
    expect(remaining(c, 61_000)).toBe(540_000)
    c = pause(c, 61_000)
    expect(remaining(c, 999_999)).toBe(540_000)
    c = start(c, 100_000)
    expect(remaining(c, 130_000)).toBe(510_000)
  })

  it('a countdown stops at zero and cannot restart until reset', () => {
    let c = start(countdown(1), 0)
    expect(isRunning(c, 59_999)).toBe(true)
    expect(isRunning(c, 60_000)).toBe(false)
    expect(isExpired(c, 61_000) && remaining(c, 61_000) === 0).toBe(true)
    c = toggle(c, 70_000)
    expect(remaining(c, 80_000)).toBe(0)
    c = pause(c, 90_000)
    expect(c.accumulatedMs).toBe(60_000)
  })

  it('stopwatch counts up', () => {
    const c = start(setMode(DEFAULT_CLOCK, 'stopwatch'), 0)
    expect(displayMs(c, 90_000)).toBe(90_000)
    expect(formatClock(displayMs(c, 90_400), false)).toBe('1:30')
  })

  it('off does nothing', () => {
    expect(start(DEFAULT_CLOCK, 0).runningSince ?? null).toBeNull()
  })

  it('a timeout pauses the clock and resumes it', () => {
    let c = startTimeout(start(countdown(10), 0), 'B', 60_000)
    expect(isRunning(c, 70_000)).toBe(false)
    expect(c.timeoutsUsed).toEqual({ A: 0, B: 1 })
    expect(timeoutRemaining(c, 75_000)).toBe(15_000)
    expect(start(c, 80_000).runningSince ?? null).toBeNull() // not mid-timeout
    c = endTimeout(c, 95_000)
    expect(isRunning(c, 95_000)).toBe(true)
    expect(remaining(c, 95_000)).toBe(540_000)
  })

  it('a timeout while paused stays paused', () => {
    const c = endTimeout(startTimeout(countdown(), 'A', 0), 30_000)
    expect(c.runningSince ?? null).toBeNull()
  })

  it('next alarm is the earliest zero', () => {
    let c = start(countdown(1), 0)
    expect(nextAlarm(c, 1_000)).toBe(60_000)
    c = startTimeout(c, 'A', 10_000)
    expect(nextAlarm(c, 11_000)).toBe(40_000)
    c = endTimeout(c, 20_000)
    expect(nextAlarm(c, 21_000)).toBe(70_000)
    expect(nextAlarm(c, 70_001)).toBeNull()
  })

  it('formats', () => {
    expect(formatClock(600_000, true)).toBe('10:00')
    expect(formatClock(59_001, true)).toBe('1:00')
    expect(formatClock(400, true)).toBe('0:01')
    expect(formatClock(0, true)).toBe('0:00')
    expect(formatClock(3_723_000, false)).toBe('1:02:03')
  })
})

describe('clock on the board', () => {
  it('a new period resets a countdown and the timeouts, keeping settings', () => {
    const c = newPeriod(startTimeout(start(countdown(10), 0), 'A', 1_000))
    expect(c.runningSince ?? null).toBeNull()
    expect(c.accumulatedMs).toBe(0)
    expect(c.timeout ?? null).toBeNull()
    expect(c.timeoutsUsed).toEqual({ A: 0, B: 0 })
    expect(c.lengthMs).toBe(600_000)
  })

  it('end match stops; a new game resets but keeps settings', () => {
    const c = stopClock(start({ ...countdown(12), sound: true }, 0), 30_000)
    expect(c.runningSince ?? null).toBeNull()
    expect(c.accumulatedMs).toBe(30_000)
    const fresh = freshClock(c)
    expect(fresh.accumulatedMs).toBe(0)
    expect(fresh.lengthMs).toBe(720_000)
    expect(fresh.sound).toBe(true)
  })

  it('reads the app (Swift) shape, where nil fields are left out', () => {
    // JSONEncoder omits nil optionals: no runningSince / timeout keys at all.
    const swift = { mode: 'countdown', lengthMs: 600000, accumulatedMs: 0, timeoutLengthMs: 30000, timeoutsUsed: { A: 1, B: 0 }, resumeAfterTimeout: false, sound: true }
    const c = readClock(swift)
    expect(c.runningSince ?? null).toBeNull()
    expect(c.timeout ?? null).toBeNull()
    expect(c.timeoutsUsed).toEqual({ A: 1, B: 0 })
    expect(readClock(undefined)).toEqual(DEFAULT_CLOCK)
  })
})
