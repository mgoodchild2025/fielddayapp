import SwiftUI
import ScoreboardKit

extension Side: @retroactive Identifiable {
    public var id: String { rawValue }
}

/// The set just ended, offered back with "Play on / End match" in the middle bar.
struct SetPrompt: Equatable, Identifiable {
    let id = UUID()
    let number: Int
    let score: SetScore
}

struct ScoreboardView: View {
    let store: BoardStore

    @State private var locked = false
    @State private var setPrompt: SetPrompt?
    @State private var editing: Side?
    @State private var menuOpen = false
    /// Events cleared by New game, kept briefly for Undo.
    @State private var clearedEvents: [ScoreEvent]?
    @State private var flash: Side?

    var body: some View {
        let board = store.board
        let tally = board.tally

        boardLayout(board: board, tally: tally)
        .background(Color.boardBackground.ignoresSafeArea())
        .statusBarHidden()
        .persistentSystemOverlays(.hidden)
        // A downward swipe on the top panel is a −1, not Notification Centre.
        .defersSystemGestures(on: .all)
        .overlay {
            if let outcome = tally.outcome {
                MatchOverlay(board: board, tally: tally, outcome: outcome, newGame: newGame, undo: undo)
                    .transition(.opacity)
            }
        }
        .animation(.snappy(duration: 0.25), value: tally.over)
        .task(id: setPrompt?.id) {
            guard setPrompt != nil else { return }
            try? await Task.sleep(for: .seconds(6))
            if !Task.isCancelled { setPrompt = nil }
        }
        .task(id: clearedEvents == nil) {
            guard clearedEvents != nil else { return }
            try? await Task.sleep(for: .seconds(8))
            if !Task.isCancelled { clearedEvents = nil }
        }
        .sheet(item: $editing) { side in
            NavigationStack {
                TeamEditor(store: store, side: side)
                    .toolbar {
                        ToolbarItem(placement: .confirmationAction) { Button("Done") { editing = nil } }
                    }
            }
            .presentationDetents([.medium, .large])
            .presentationBackground(Color(.systemGroupedBackground))
        }
        .sheet(isPresented: $menuOpen) {
            MenuSheet(store: store, endMatch: endMatch, newGame: newGame, close: { menuOpen = false })
                .presentationDetents([.medium, .large])
                // Solid, not glass: the giant score behind it made the list hard to read.
                .presentationBackground(Color(.systemGroupedBackground))
        }
    }

    private func boardLayout(board: Board, tally: Tally) -> some View {
        let order = board.displayOrder
        return GeometryReader { geo in
            let landscape = geo.size.width > geo.size.height
            let layout = landscape ? AnyLayout(HStackLayout(spacing: 0)) : AnyLayout(VStackLayout(spacing: 0))
            layout {
                panel(order.first, board: board, tally: tally)
                middleBar(board: board, tally: tally, vertical: landscape)
                panel(order.second, board: board, tally: tally)
            }
        }
    }

    private func middleBar(board: Board, tally: Tally, vertical: Bool) -> MiddleBar {
        MiddleBar(
            vertical: vertical,
            board: board,
            tally: tally,
            locked: locked,
            setPrompt: setPrompt,
            endSet: endSet,
            endMatch: endMatch,
            playOn: { setPrompt = nil },
            undo: undo,
            swap: { store.change { $0.swapped.toggle() } },
            openMenu: { menuOpen = true },
            lock: { locked = true; Haptics.select() },
            unlock: { locked = false; Haptics.select() },
            undoReset: undoResetAction(board)
        )
    }

    /// Only while the board is still empty: once a point is scored,
    /// restoring the cleared game would overwrite it.
    private func undoResetAction(_ board: Board) -> (() -> Void)? {
        guard clearedEvents != nil, board.events.isEmpty else { return nil }
        return { restoreCleared() }
    }

    private func panel(_ side: Side, board: Board, tally: Tally) -> some View {
        TeamPanel(
            team: board.team(side),
            points: tally.points(side),
            setsWon: tally.setsWon(side),
            showSets: board.mode == .sets,
            locked: locked || tally.over,
            flash: flash == side,
            onScore: { score(side, $0) },
            onEdit: { editing = side }
        )
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    private func score(_ side: Side, _ delta: Int) {
        guard !locked else { return }
        let changed = store.change { $0.score(side, delta) }
        guard changed else { return }
        if delta > 0 {
            Haptics.point()
            flash = side
            Task {
                try? await Task.sleep(for: .milliseconds(180))
                if flash == side { flash = nil }
            }
        } else {
            Haptics.minus()
        }
        announceScore()
    }

    private func endSet() {
        guard let recorded = store.change({ $0.endSet() }) else { return }
        Haptics.set()
        setPrompt = SetPrompt(number: recorded.number, score: recorded.score)
        announceScore()
    }

    private func endMatch() {
        guard store.change({ $0.endMatch() }) else { return }
        Haptics.match()
        setPrompt = nil
        menuOpen = false
    }

    private func undo() {
        guard store.change({ $0.undo() }) else { return }
        Haptics.select()
        setPrompt = nil
        announceScore()
    }

    private func newGame() {
        let previous = store.change { $0.reset() }
        setPrompt = nil
        menuOpen = false
        clearedEvents = previous.isEmpty ? nil : previous
    }

    private func restoreCleared() {
        if let previous = clearedEvents { store.change { $0.restore(previous) } }
        clearedEvents = nil
    }

    /// The numbers swap in place inside a control VoiceOver is still focused
    /// on, so say the new score.
    private func announceScore() {
        guard UIAccessibility.isVoiceOverRunning else { return }
        let b = store.board
        let t = b.tally
        var text = "\(b.teamA.name) \(t.a), \(b.teamB.name) \(t.b)"
        if b.mode == .sets { text += ". Sets \(t.setsWonA) to \(t.setsWonB)" }
        AccessibilityNotification.Announcement(text).post()
    }
}
