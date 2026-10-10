import Foundation
import Observation

/// The board the UI shows: persists every change and hands it to the sync.
@MainActor
@Observable
public final class BoardStore {
    public private(set) var board: Board

    /// Called after every local change (the sync sends it to the other device).
    @ObservationIgnored public var onLocalChange: ((Board) -> Void)?

    @ObservationIgnored private let defaults: UserDefaults
    @ObservationIgnored private let key: String
    @ObservationIgnored private let now: () -> Double

    public static let storageKey = "fieldday-scoreboard-v1"

    public init(
        defaults: UserDefaults = .standard,
        key: String = BoardStore.storageKey,
        now: @escaping () -> Double = { Date().timeIntervalSince1970 * 1000 }
    ) {
        self.defaults = defaults
        self.key = key
        self.now = now
        board = Self.load(defaults, key)
    }

    public var tally: Tally { board.tally }

    /// Applies a local change. The closure returns whether anything changed;
    /// only real changes are saved, stamped and synced.
    @discardableResult
    public func change<T>(_ body: (inout Board) -> T) -> T {
        var next = board
        let result = body(&next)
        guard next != board else { return result }
        next.rev += 1
        next.updatedAt = now()
        board = next
        save()
        onLocalChange?(next)
        return result
    }

    /// The store's clock (ms since 1970) — injectable for tests.
    public func currentTime() -> Double { now() }

    /// A clock control (start, pause, timeout…): stamped with the store's time
    /// and saved + synced like any other change.
    public func changeClock(_ body: (inout GameClock, Double) -> Void) {
        let t = now()
        change { body(&$0.clock, t) }
    }

    /// A board from the other device. Adopted only when it's newer; the
    /// Lamport clock then moves past it so the next local change wins.
    @discardableResult
    public func adopt(_ remote: Board) -> Bool {
        guard board.isOlder(than: remote) else { return false }
        board = remote
        save()
        return true
    }

    private func save() {
        guard let data = try? JSONEncoder().encode(board) else { return }
        defaults.set(data, forKey: key)
    }

    private static func load(_ defaults: UserDefaults, _ key: String) -> Board {
        guard let data = defaults.data(forKey: key),
              let board = try? JSONDecoder().decode(Board.self, from: data),
              board.v == 1
        else { return Board() }
        return board
    }
}
