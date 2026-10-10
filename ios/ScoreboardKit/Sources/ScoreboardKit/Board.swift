import Foundation

// ── Fieldday Scoreboard engine ────────────────────────────────────────────────
// A port of the web board (components/scoreboard/scoreboard-app.tsx). Every
// score change is an event; scores and completed sets are derived by folding
// the event list, so Undo is a pop and the per-set history falls out for free.
// The JSON shape matches the web board's localStorage value exactly.
//
// Set formats (targets, best-of, win-by-2) are deliberately NOT modelled: the
// scorekeeper ends a set or the match when it's over, so any house rule works.

public enum Side: String, Codable, Sendable, CaseIterable {
    case a = "A"
    case b = "B"

    public var other: Side { self == .a ? .b : .a }
}

public enum ScoreEvent: Equatable, Sendable {
    /// +1 or −1 for one side.
    case point(Side, Int)
    /// The in-progress set is finished and recorded.
    case endSet
    /// The match is over. `folded`: End match also recorded the in-progress
    /// set, so Undo takes both back.
    case endMatch(folded: Bool)
}

extension ScoreEvent: Codable {
    // {t:'A'|'B', d:1|-1} · {t:'set'} · {t:'end', folded?:true}
    private enum CodingKeys: String, CodingKey { case t, d, folded }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        let t = try c.decode(String.self, forKey: .t)
        switch t {
        case "set":
            self = .endSet
        case "end":
            self = .endMatch(folded: try c.decodeIfPresent(Bool.self, forKey: .folded) ?? false)
        default:
            guard let side = Side(rawValue: t) else {
                throw DecodingError.dataCorruptedError(forKey: .t, in: c, debugDescription: "Unknown event \(t)")
            }
            let d = try c.decode(Int.self, forKey: .d)
            self = .point(side, d < 0 ? -1 : 1)
        }
    }

    public func encode(to encoder: Encoder) throws {
        var c = encoder.container(keyedBy: CodingKeys.self)
        switch self {
        case let .point(side, d):
            try c.encode(side.rawValue, forKey: .t)
            try c.encode(d, forKey: .d)
        case .endSet:
            try c.encode("set", forKey: .t)
        case let .endMatch(folded):
            try c.encode("end", forKey: .t)
            if folded { try c.encode(true, forKey: .folded) }
        }
    }
}

public struct Team: Codable, Equatable, Sendable {
    public var name: String
    /// "#RRGGBB"
    public var color: String

    public init(name: String, color: String) {
        self.name = name
        self.color = color
    }
}

public enum ScoringMode: String, Codable, Sendable, CaseIterable {
    case free
    case sets
}

public struct SetScore: Codable, Equatable, Sendable {
    public var home: Int
    public var away: Int

    public init(home: Int, away: Int) {
        self.home = home
        self.away = away
    }
}

public enum Outcome: Equatable, Sendable {
    case won(Side)
    case tie
}

/// Everything the board shows, derived from the events.
public struct Tally: Equatable, Sendable {
    public var a = 0
    public var b = 0
    public var sets: [SetScore] = []
    public var over = false

    public var setsWonA: Int { sets.filter { $0.home > $0.away }.count }
    public var setsWonB: Int { sets.filter { $0.away > $0.home }.count }

    public func points(_ side: Side) -> Int { side == .a ? a : b }
    public func setsWon(_ side: Side) -> Int { side == .a ? setsWonA : setsWonB }

    /// The scorekeeper declares the end; a tie is legal (two-set timeslots).
    public var outcome: Outcome? {
        guard over else { return nil }
        if setsWonA > setsWonB { return .won(.a) }
        if setsWonB > setsWonA { return .won(.b) }
        return .tie
    }
}

public func derive(_ events: [ScoreEvent]) -> Tally {
    var t = Tally()
    for e in events {
        switch e {
        case .endSet:
            t.sets.append(SetScore(home: t.a, away: t.b))
            t.a = 0
            t.b = 0
        case .endMatch:
            t.over = true
        case let .point(.a, d):
            t.a = max(0, t.a + d)
        case let .point(.b, d):
            t.b = max(0, t.b + d)
        }
    }
    return t
}

public let teamPalette = ["#0E9F6E", "#2563EB", "#DC2626", "#EA580C", "#7C3AED", "#DB2777", "#0891B2", "#475569"]

public struct Board: Codable, Equatable, Sendable {
    public struct Config: Codable, Equatable, Sendable {
        public var mode: ScoringMode
    }

    public var v = 1
    public var events: [ScoreEvent] = []
    public var teamA = Team(name: "HOME", color: teamPalette[0])
    public var teamB = Team(name: "AWAY", color: teamPalette[1])
    public var config = Config(mode: .free)
    /// Display-only: scores stay keyed to the real teams.
    public var swapped = false
    /// Milliseconds since 1970, like the web board's Date.now().
    public var updatedAt: Double = 0
    /// Lamport clock for phone ↔ watch sync: bumped on every local change,
    /// raised past any board adopted from the other device.
    public var rev = 0
    /// Game clock + timeouts (off by default). Not part of the score history.
    public var clock = GameClock()

    public init() {}

    // Tolerant decode: missing keys (the web shape has no `rev`) keep defaults.
    private enum CodingKeys: String, CodingKey { case v, events, teamA, teamB, config, swapped, updatedAt, rev, clock }

    public init(from decoder: Decoder) throws {
        let c = try decoder.container(keyedBy: CodingKeys.self)
        v = try c.decodeIfPresent(Int.self, forKey: .v) ?? 1
        events = try c.decodeIfPresent([ScoreEvent].self, forKey: .events) ?? []
        teamA = try c.decodeIfPresent(Team.self, forKey: .teamA) ?? teamA
        teamB = try c.decodeIfPresent(Team.self, forKey: .teamB) ?? teamB
        config = try c.decodeIfPresent(Config.self, forKey: .config) ?? config
        swapped = try c.decodeIfPresent(Bool.self, forKey: .swapped) ?? false
        updatedAt = try c.decodeIfPresent(Double.self, forKey: .updatedAt) ?? 0
        rev = try c.decodeIfPresent(Int.self, forKey: .rev) ?? 0
        clock = (try? c.decodeIfPresent(GameClock.self, forKey: .clock)) ?? GameClock()
    }

    public var tally: Tally { derive(events) }

    public var mode: ScoringMode {
        get { config.mode }
        set { config.mode = newValue }
    }

    public func team(_ side: Side) -> Team { side == .a ? teamA : teamB }

    public mutating func setTeam(_ side: Side, _ team: Team) {
        if side == .a { teamA = team } else { teamB = team }
    }

    /// Display order honours side swaps.
    public var displayOrder: (first: Side, second: Side) { swapped ? (.b, .a) : (.a, .b) }

    // ── Mutations. Each returns whether the board changed. ───────────────────

    @discardableResult
    public mutating func score(_ side: Side, _ delta: Int) -> Bool {
        let t = tally
        guard !t.over else { return false }
        // A −1 on zero is a no-op in the fold; don't record it (it would make
        // the next Undo appear to do nothing).
        if delta < 0 && t.points(side) == 0 { return false }
        events.append(.point(side, delta < 0 ? -1 : 1))
        return true
    }

    /// Ends the in-progress set. Returns the set just recorded (with its
    /// 1-based number), or nil when there's nothing to end.
    @discardableResult
    public mutating func endSet() -> (number: Int, score: SetScore)? {
        let t = tally
        guard t.a + t.b > 0, !t.over else { return nil }
        events.append(.endSet)
        clock.newPeriod()
        return (t.sets.count + 1, SetScore(home: t.a, away: t.b))
    }

    /// Ends the match, folding any in-progress set into the set line.
    @discardableResult
    public mutating func endMatch(at now: Double = Date().timeIntervalSince1970 * 1000) -> Bool {
        let t = tally
        guard !t.over else { return false }
        clock.stop(at: now)
        let folded = t.a + t.b > 0
        if folded { events.append(.endSet) }
        events.append(.endMatch(folded: folded))
        return true
    }

    @discardableResult
    public mutating func undo() -> Bool {
        guard let last = events.last else { return false }
        let n = if case .endMatch(folded: true) = last { 2 } else { 1 }
        events.removeLast(min(n, events.count))
        return true
    }

    /// Clears the scores (teams, colours and mode stay). Returns the events
    /// that were cleared, for an Undo.
    @discardableResult
    public mutating func reset() -> [ScoreEvent] {
        let previous = events
        events = []
        // A new game starts with a fresh clock; its settings stay.
        clock.newPeriod()
        clock.reset()
        return previous
    }

    /// Undo for a reset: only restores into a still-empty board.
    @discardableResult
    public mutating func restore(_ previous: [ScoreEvent]) -> Bool {
        guard events.isEmpty, !previous.isEmpty else { return false }
        events = previous
        return true
    }

    /// Phone ↔ watch: should this device adopt `other`?
    public func isOlder(than other: Board) -> Bool {
        other.rev > rev || (other.rev == rev && other.updatedAt > updatedAt)
    }
}
