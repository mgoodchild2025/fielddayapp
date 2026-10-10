import Foundation

// ── Game clock + timeouts ─────────────────────────────────────────────────────
// Kept beside the score events, not in them: Undo is a score tool and never
// touches the clock. Time is derived from timestamps (when it started, how
// much had already run), never counted tick by tick, so it stays exact through
// a locked phone, a relaunch, or a phone ↔ watch hand-off.
//
// Nothing here ends a set or the match: at 0:00 the scorekeeper is offered
// End set / End match, so "finish the point" and golden-point rules still work.
// Same JSON shape as the web board (lib/scoreboard-clock.ts).

public struct GameClock: Codable, Equatable, Sendable {
    public enum Mode: String, Codable, Sendable, CaseIterable {
        case off, stopwatch, countdown
    }

    public struct Timeout: Codable, Equatable, Sendable {
        public var side: Side
        /// ms since 1970.
        public var startedAt: Double
    }

    public struct Used: Codable, Equatable, Sendable {
        public var A = 0
        public var B = 0
        public subscript(side: Side) -> Int {
            get { side == .a ? A : B }
            set { if side == .a { A = newValue } else { B = newValue } }
        }
    }

    public var mode: Mode = .off
    /// Countdown length.
    public var lengthMs: Double = 20 * 60_000
    /// When the clock was last started (ms since 1970); nil while stopped.
    public var runningSince: Double?
    /// Time that ran before `runningSince`.
    public var accumulatedMs: Double = 0
    public var timeoutLengthMs: Double = 30_000
    public var timeout: Timeout?
    /// Timeouts taken this set.
    public var timeoutsUsed = Used()
    /// The game clock was running when the timeout started: resume after it.
    public var resumeAfterTimeout = false
    /// Horn at zero (vibration always).
    public var sound = false

    public init() {}

    public static let lengthPresetsMinutes = [10, 12, 15, 20, 25]

    // ── Derived ───────────────────────────────────────────────────────────────

    public var isOn: Bool { mode != .off }

    public func elapsed(at now: Double) -> Double {
        accumulatedMs + (runningSince.map { max(0, now - $0) } ?? 0)
    }

    /// Countdown: left on the clock (never below zero).
    public func remaining(at now: Double) -> Double { max(0, lengthMs - elapsed(at: now)) }

    /// What the clock face shows, in ms.
    public func displayMs(at now: Double) -> Double {
        mode == .countdown ? remaining(at: now) : elapsed(at: now)
    }

    public func isExpired(at now: Double) -> Bool {
        mode == .countdown && elapsed(at: now) >= lengthMs
    }

    /// Running = started and (for a countdown) not yet at zero.
    public func isRunning(at now: Double) -> Bool {
        runningSince != nil && !isExpired(at: now)
    }

    public func timeoutRemaining(at now: Double) -> Double? {
        guard let timeout else { return nil }
        return max(0, timeoutLengthMs - (now - timeout.startedAt))
    }

    /// The next moment something should buzz (countdown zero or timeout zero).
    public func nextAlarm(at now: Double) -> Double? {
        var alarms: [Double] = []
        if mode == .countdown, let since = runningSince {
            let at = since + (lengthMs - accumulatedMs)
            if at > now { alarms.append(at) }
        }
        if let timeout {
            let at = timeout.startedAt + timeoutLengthMs
            if at > now { alarms.append(at) }
        }
        return alarms.min()
    }

    // ── Clock controls ────────────────────────────────────────────────────────

    public mutating func start(at now: Double) {
        guard isOn, runningSince == nil, !isExpired(at: now), timeout == nil else { return }
        runningSince = now
    }

    public mutating func pause(at now: Double) {
        guard let since = runningSince else { return }
        accumulatedMs = mode == .countdown ? min(lengthMs, accumulatedMs + now - since) : accumulatedMs + now - since
        runningSince = nil
    }

    public mutating func toggle(at now: Double) {
        if runningSince != nil && !isExpired(at: now) { pause(at: now) } else { start(at: now) }
    }

    /// Back to the full length (countdown) or zero (stopwatch), stopped.
    public mutating func reset() {
        runningSince = nil
        accumulatedMs = 0
    }

    public mutating func setMode(_ newMode: Mode) {
        guard newMode != mode else { return }
        mode = newMode
        reset()
        timeout = nil
        resumeAfterTimeout = false
    }

    public mutating func setLength(minutes: Int) {
        lengthMs = Double(max(1, min(180, minutes))) * 60_000
        reset()
    }

    // ── Timeouts ──────────────────────────────────────────────────────────────

    /// A team calls a timeout: pause a running game clock (it resumes after).
    public mutating func startTimeout(_ side: Side, at now: Double) {
        guard timeout == nil else { return }
        resumeAfterTimeout = isRunning(at: now)
        pause(at: now)
        timeout = Timeout(side: side, startedAt: now)
        timeoutsUsed[side] += 1
    }

    public mutating func endTimeout(at now: Double) {
        guard timeout != nil else { return }
        timeout = nil
        if resumeAfterTimeout { start(at: now) }
        resumeAfterTimeout = false
    }

    /// A set (or half) ended: the next one starts fresh.
    public mutating func newPeriod() {
        if mode == .countdown { reset() }
        timeout = nil
        resumeAfterTimeout = false
        timeoutsUsed = Used()
    }

    /// The match ended: stop the clock where it is.
    public mutating func stop(at now: Double) {
        pause(at: now)
        timeout = nil
        resumeAfterTimeout = false
    }
}

/// "12:34", "1:02:03" past an hour, "0:09".
public func formatClock(_ ms: Double, roundingUp: Bool) -> String {
    // A countdown rounds up (shows 0:01 until it truly hits zero); a stopwatch down.
    let total = Int(roundingUp ? (ms / 1000).rounded(.up) : (ms / 1000).rounded(.down))
    let h = total / 3600, m = (total % 3600) / 60, s = total % 60
    return h > 0 ? String(format: "%d:%02d:%02d", h, m, s) : String(format: "%d:%02d", m, s)
}
