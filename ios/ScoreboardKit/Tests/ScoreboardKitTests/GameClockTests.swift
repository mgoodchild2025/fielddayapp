import Foundation
import Testing
@testable import ScoreboardKit

@Suite("Game clock")
struct GameClockTests {
    private func countdown(minutes: Int = 20) -> GameClock {
        var c = GameClock()
        c.setMode(.countdown)
        c.setLength(minutes: minutes)
        return c
    }

    @Test func runsFromTimestampsAndPauses() {
        var c = countdown(minutes: 10)
        c.start(at: 1_000)
        #expect(c.remaining(at: 61_000) == 540_000)
        c.pause(at: 61_000)
        #expect(c.remaining(at: 999_999) == 540_000) // paused: time doesn't move
        c.start(at: 100_000)
        #expect(c.remaining(at: 130_000) == 510_000)
    }

    @Test func countdownStopsAtZeroAndCannotRestart() {
        var c = countdown(minutes: 1)
        c.start(at: 0)
        #expect(c.isRunning(at: 59_999))
        #expect(!c.isRunning(at: 60_000))
        #expect(c.isExpired(at: 61_000) && c.remaining(at: 61_000) == 0)
        c.toggle(at: 70_000) // tap at 0:00 does nothing
        #expect(c.remaining(at: 80_000) == 0)
        c.pause(at: 90_000)
        #expect(c.accumulatedMs == 60_000) // clamped, not 90s
        c.reset()
        #expect(c.remaining(at: 100_000) == 60_000)
    }

    @Test func stopwatchCountsUp() {
        var c = GameClock()
        c.setMode(.stopwatch)
        c.start(at: 0)
        #expect(c.displayMs(at: 90_000) == 90_000)
        #expect(formatClock(c.displayMs(at: 90_400), roundingUp: false) == "1:30")
    }

    @Test func offDoesNothing() {
        var c = GameClock()
        c.start(at: 0)
        #expect(c.runningSince == nil)
    }

    @Test func timeoutPausesTheClockAndResumesIt() {
        var c = countdown(minutes: 10)
        c.start(at: 0)
        c.startTimeout(.b, at: 60_000)
        #expect(!c.isRunning(at: 70_000))
        #expect(c.timeoutsUsed[.b] == 1 && c.timeoutsUsed[.a] == 0)
        #expect(c.timeoutRemaining(at: 75_000) == 15_000)
        c.start(at: 80_000) // can't start the game clock mid-timeout
        #expect(c.runningSince == nil)
        c.endTimeout(at: 95_000)
        #expect(c.isRunning(at: 95_000))
        #expect(c.remaining(at: 95_000) == 540_000) // the timeout didn't use game time
    }

    @Test func timeoutWhilePausedStaysPaused() {
        var c = countdown()
        c.startTimeout(.a, at: 0)
        c.endTimeout(at: 30_000)
        #expect(c.runningSince == nil)
    }

    @Test func nextAlarmIsTheEarliestZero() {
        var c = countdown(minutes: 1)
        c.start(at: 0)
        #expect(c.nextAlarm(at: 1_000) == 60_000)
        c.startTimeout(.a, at: 10_000) // pauses the clock
        #expect(c.nextAlarm(at: 11_000) == 40_000) // the timeout's zero
        c.endTimeout(at: 20_000)
        #expect(c.nextAlarm(at: 21_000) == 70_000) // 50s left, resumed at 20s
        #expect(c.nextAlarm(at: 70_001) == nil)
    }

    @Test func formatting() {
        #expect(formatClock(600_000, roundingUp: true) == "10:00")
        #expect(formatClock(59_001, roundingUp: true) == "1:00")
        #expect(formatClock(400, roundingUp: true) == "0:01")
        #expect(formatClock(0, roundingUp: true) == "0:00")
        #expect(formatClock(3_723_000, roundingUp: false) == "1:02:03")
    }
}

@Suite("Clock on the board")
struct BoardClockTests {
    @Test func endSetStartsAFreshPeriod() {
        var b = Board()
        b.clock.setMode(.countdown)
        b.clock.setLength(minutes: 10)
        b.clock.start(at: 0)
        b.clock.startTimeout(.a, at: 1_000)
        b.score(.a, 1)
        b.endSet()
        #expect(b.clock.runningSince == nil && b.clock.accumulatedMs == 0)
        #expect(b.clock.timeout == nil && b.clock.timeoutsUsed[.a] == 0)
        #expect(b.clock.lengthMs == 600_000 && b.clock.mode == .countdown)
    }

    @Test func undoNeverTouchesTheClock() {
        var b = Board()
        b.clock.setMode(.stopwatch)
        b.clock.start(at: 0)
        b.score(.a, 1)
        b.undo()
        #expect(b.clock.runningSince == 0)
    }

    @Test func endMatchStopsAndNewGameResetsButKeepsSettings() {
        var b = Board()
        b.clock.setMode(.countdown)
        b.clock.setLength(minutes: 12)
        b.clock.sound = true
        b.clock.start(at: 0)
        b.score(.b, 1)
        b.endMatch(at: 30_000)
        #expect(b.clock.runningSince == nil && b.clock.accumulatedMs == 30_000)
        b.reset()
        #expect(b.clock.accumulatedMs == 0 && b.clock.lengthMs == 720_000 && b.clock.sound)
    }

    @Test func oldBoardsLoadWithTheClockOff() throws {
        let json = #"{"v":1,"events":[],"config":{"mode":"free"},"swapped":false,"updatedAt":0}"#
        let b = try JSONDecoder().decode(Board.self, from: Data(json.utf8))
        #expect(b.clock == GameClock())
    }

    @Test func clockRoundTripsInTheWebShape() throws {
        var b = Board()
        b.clock.setMode(.countdown)
        b.clock.startTimeout(.b, at: 5)
        let json = try #require(String(data: JSONEncoder().encode(b), encoding: .utf8))
        #expect(json.contains(#""mode":"countdown""#))
        #expect(json.contains(#""side":"B""#))
        #expect(json.contains(#""timeoutsUsed":{"#))
        let back = try JSONDecoder().decode(Board.self, from: Data(json.utf8))
        #expect(back.clock == b.clock)
    }
}
