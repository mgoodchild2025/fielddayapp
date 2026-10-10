import Foundation
import Testing
@testable import ScoreboardKit

@Suite("Fold")
struct FoldTests {
    @Test func pointsAndSets() {
        let t = derive([.point(.a, 1), .point(.a, 1), .point(.b, 1), .endSet, .point(.b, 1)])
        #expect(t.a == 0 && t.b == 1)
        #expect(t.sets == [SetScore(home: 2, away: 1)])
        #expect(t.setsWonA == 1 && t.setsWonB == 0)
        #expect(!t.over && t.outcome == nil)
    }

    @Test func neverBelowZero() {
        #expect(derive([.point(.a, -1), .point(.a, 1)]).a == 1)
    }

    @Test func outcomeFollowsSetsWon() {
        #expect(derive([.point(.b, 1), .endSet, .endMatch(folded: false)]).outcome == .won(.b))
        // Two-set timeslot nights: 1–1 is a legal finish.
        let tie = derive([.point(.a, 1), .endSet, .point(.b, 1), .endSet, .endMatch(folded: false)])
        #expect(tie.outcome == .tie)
    }
}

@Suite("Board")
struct BoardTests {
    @Test func minusOnZeroIsNotRecorded() {
        var b = Board()
        let changed = b.score(.a, -1)
        #expect(!changed)
        #expect(b.events.isEmpty)
    }

    @Test func noScoringAfterTheMatchEnds() {
        var b = Board()
        b.score(.a, 1)
        b.endMatch()
        let changed = b.score(.a, 1)
        #expect(!changed)
    }

    @Test func endSetNeedsPoints() {
        var b = Board()
        #expect(b.endSet() == nil)
        b.score(.b, 1)
        let rec = b.endSet()
        #expect(rec?.number == 1 && rec?.score == SetScore(home: 0, away: 1))
    }

    @Test func endMatchFoldsTheInProgressSetAndUndoTakesBothBack() {
        var b = Board()
        b.score(.a, 1)
        b.endMatch()
        #expect(b.events == [.point(.a, 1), .endSet, .endMatch(folded: true)])
        #expect(b.tally.outcome == .won(.a))
        b.undo()
        #expect(b.events == [.point(.a, 1)])
        #expect(b.tally.a == 1 && b.tally.sets.isEmpty)
    }

    @Test func endMatchWithNothingInProgressDoesNotAddASet() {
        var b = Board()
        b.score(.a, 1)
        b.endSet()
        b.endMatch()
        #expect(b.events.last == .endMatch(folded: false))
        b.undo()
        #expect(b.events.last == .endSet)
    }

    @Test func resetAndRestore() {
        var b = Board()
        b.score(.a, 1)
        let previous = b.reset()
        #expect(b.events.isEmpty)
        let changed = b.restore(previous)
        #expect(changed)
        #expect(b.events == [.point(.a, 1)])
        // Undo-of-reset never overwrites a board that's been scored since.
        b.reset()
        b.score(.b, 1)
        let restoredOverScores = b.restore(previous)
        #expect(!restoredOverScores)
    }

    @Test func swapIsDisplayOnly() {
        var b = Board()
        b.swapped = true
        b.score(.a, 1)
        #expect(b.displayOrder.first == .b)
        #expect(b.tally.a == 1)
    }
}

@Suite("JSON")
struct JSONTests {
    @Test func matchesTheWebBoardShape() throws {
        var b = Board()
        b.score(.a, 1)
        b.score(.b, 1)
        b.score(.a, -1)
        b.endSet()
        b.endMatch()
        let json = try #require(String(data: JSONEncoder().encode(b.events), encoding: .utf8))
        #expect(json.contains(#"{"d":1,"t":"A"}"#) || json.contains(#"{"t":"A","d":1}"#))
        #expect(json.contains(#""t":"set""#))
        #expect(!json.contains("folded")) // nothing in progress → plain end
    }

    @Test func decodesAWebBoard() throws {
        let web = #"""
        {"v":1,"events":[{"t":"A","d":1},{"t":"B","d":-1},{"t":"set"},{"t":"end","folded":true}],
         "teamA":{"name":"Spikers","color":"#DC2626"},"teamB":{"name":"AWAY","color":"#2563EB"},
         "config":{"mode":"sets"},"swapped":true,"updatedAt":1790000000000}
        """#
        let b = try JSONDecoder().decode(Board.self, from: Data(web.utf8))
        #expect(b.events.count == 4)
        #expect(b.events.last == .endMatch(folded: true))
        #expect(b.teamA.name == "Spikers" && b.mode == .sets && b.swapped)
        #expect(b.rev == 0)
    }
}

@Suite("Store & sync ordering")
@MainActor
struct StoreTests {
    private func makeStore(_ clock: Clock) -> BoardStore {
        let suite = "scoreboard-tests-\(UUID().uuidString)"
        return BoardStore(defaults: UserDefaults(suiteName: suite)!, now: { clock.next() })
    }

    final class Clock: @unchecked Sendable {
        var t = 1000.0
        func next() -> Double { t += 1; return t }
    }

    @Test func onlyRealChangesBumpTheClockAndSync() {
        let store = makeStore(Clock())
        var sent = 0
        store.onLocalChange = { _ in sent += 1 }
        store.change { $0.score(.a, -1) } // no-op
        #expect(store.board.rev == 0 && sent == 0)
        store.change { $0.score(.a, 1) }
        #expect(store.board.rev == 1 && sent == 1)
    }

    @Test func persistsAcrossLaunches() {
        let suite = "scoreboard-tests-\(UUID().uuidString)"
        let defaults = UserDefaults(suiteName: suite)!
        BoardStore(defaults: defaults).change { $0.score(.b, 1) }
        #expect(BoardStore(defaults: defaults).tally.b == 1)
    }

    @Test func adoptsOnlyNewerBoardsAndThenOutranksThem() {
        let clock = Clock()
        let phone = makeStore(clock)
        let watch = makeStore(clock)
        phone.change { $0.score(.a, 1) }
        phone.change { $0.score(.a, 1) }
        #expect(watch.adopt(phone.board))
        #expect(watch.tally.a == 2)
        // A stale or duplicate delivery is ignored.
        #expect(!watch.adopt(phone.board))
        var stale = phone.board
        stale.rev = 1
        #expect(!watch.adopt(stale))
        // The next change on the watch wins over the board it adopted.
        watch.change { $0.score(.b, 1) }
        #expect(phone.board.isOlder(than: watch.board))
        #expect(phone.adopt(watch.board))
        #expect(phone.tally.a == 2 && phone.tally.b == 1)
    }
}
