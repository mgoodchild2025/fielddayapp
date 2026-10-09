import SwiftUI
import WatchKit
import ScoreboardKit

/// The wrist board: two halves (tap = +1, swipe down = −1) with a strip of
/// controls between them. Every change syncs to the iPhone app.
struct WatchBoardView: View {
    let store: BoardStore

    @State private var menuOpen = false
    @State private var setPrompt: (id: UUID, number: Int, score: SetScore)?
    @Environment(\.isLuminanceReduced) private var dimmed

    var body: some View {
        let board = store.board
        let tally = board.tally
        let order = board.displayOrder

        VStack(spacing: 4) {
            half(order.first, board: board, tally: tally)
            controls(board: board, tally: tally)
            half(order.second, board: board, tally: tally)
        }
        .ignoresSafeArea(edges: .bottom)
        .overlay {
            if let outcome = tally.outcome, !dimmed {
                matchOver(board: board, tally: tally, outcome: outcome)
            }
        }
        .task(id: setPrompt?.id) {
            guard setPrompt != nil else { return }
            try? await Task.sleep(for: .seconds(6))
            if !Task.isCancelled { setPrompt = nil }
        }
        .sheet(isPresented: $menuOpen) {
            WatchMenu(store: store, endMatch: endMatch, newGame: newGame)
        }
    }

    // ── Halves ───────────────────────────────────────────────────────────────

    private func half(_ side: Side, board: Board, tally: Tally) -> some View {
        let team = board.team(side)
        let points = tally.points(side)
        let won = tally.setsWon(side)
        return GeometryReader { geo in
            ZStack {
                RoundedRectangle(cornerRadius: 12)
                    .fill(team.swiftUIColor.opacity(dimmed ? 0.35 : 1))
                VStack(spacing: 0) {
                    Text(team.name)
                        .font(.system(size: 12, weight: .bold))
                        .textCase(.uppercase)
                        .lineLimit(1)
                        .foregroundStyle(.white.opacity(0.85))
                    // Leave room for the set dots when there are any.
                    let showDots = board.mode == .sets && won > 0
                    Text("\(points)")
                        .font(.system(size: geo.size.height * (showDots ? 0.5 : 0.62), weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.5)
                        .foregroundStyle(.white)
                        .contentTransition(.numericText(value: Double(points)))
                    if showDots {
                        HStack(spacing: 4) {
                            ForEach(0..<won, id: \.self) { _ in Circle().fill(.white).frame(width: 6, height: 6) }
                        }
                    }
                }
                .padding(.horizontal, 6)
            }
            .contentShape(Rectangle())
            .gesture(
                DragGesture(minimumDistance: 0).onEnded { value in
                    let t = value.translation
                    if t.height >= 30 && abs(t.width) < t.height {
                        score(side, -1)
                    } else if hypot(t.width, t.height) < 10 {
                        score(side, 1)
                    }
                },
                including: tally.over ? .subviews : .all
            )
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(team.name)
        .accessibilityValue("\(points) \(points == 1 ? "point" : "points")")
        .accessibilityAdjustableAction { direction in
            score(side, direction == .increment ? 1 : -1)
        }
    }

    // ── Controls ─────────────────────────────────────────────────────────────

    @ViewBuilder
    private func controls(board: Board, tally: Tally) -> some View {
        HStack(spacing: 4) {
            if let prompt = setPrompt, !tally.over {
                Button("Play on") { setPrompt = nil }
                    .accessibilityHint("Set \(prompt.number) ended \(prompt.score.home) to \(prompt.score.away)")
                Button {
                    endMatch()
                } label: {
                    Image(systemName: "flag.checkered")
                }
                .buttonStyle(.borderedProminent)
                .tint(.boardAction)
                .accessibilityLabel("End match")
            } else {
                Button { undo() } label: { Image(systemName: "arrow.uturn.backward") }
                    .disabled(board.events.isEmpty)
                    .accessibilityLabel("Undo")
                if board.mode == .sets {
                    Button("Set \(tally.sets.count + 1)") { endSet() }
                        .buttonStyle(.borderedProminent)
                        .tint(.boardAction)
                        .disabled(tally.a + tally.b == 0 || tally.over)
                        .accessibilityLabel("End set \(tally.sets.count + 1)")
                }
                Button { menuOpen = true } label: { Image(systemName: "ellipsis") }
                    .accessibilityLabel("Menu")
            }
        }
        .buttonStyle(.bordered)
        .controlSize(.mini)
        .font(.footnote.weight(.semibold))
        .frame(height: 30)
        .opacity(dimmed ? 0 : 1)
    }

    private func matchOver(board: Board, tally: Tally, outcome: Outcome) -> some View {
        ZStack {
            ZStack {
                Color.black
                // The winner's colour washes in from the top, like the phone.
                if case let .won(side) = outcome {
                    LinearGradient(colors: [board.team(side).swiftUIColor.opacity(0.55), .clear], startPoint: .top, endPoint: .center)
                }
            }
            .ignoresSafeArea()
            ScrollView {
                VStack(spacing: 6) {
                    Image(systemName: outcome == .tie ? "equal.circle.fill" : "trophy.fill")
                        .font(.title2)
                        .foregroundStyle(outcome == .tie ? .white : Color(hex: "#FBBF24"))
                    Text(outcomeTitle(board: board, tally: tally, outcome: outcome))
                        .font(.headline)
                        .multilineTextAlignment(.center)
                    if !tally.sets.isEmpty {
                        Text(tally.sets.map { "\($0.home)–\($0.away)" }.joined(separator: "  "))
                            .font(.footnote)
                            .monospacedDigit()
                            .foregroundStyle(.secondary)
                    }
                    Button("New game", action: newGame)
                        .buttonStyle(.borderedProminent)
                        .tint(.boardAction)
                    Button("Undo", action: undo)
                }
            }
        }
    }

    private func outcomeTitle(board: Board, tally: Tally, outcome: Outcome) -> String {
        switch outcome {
        case .tie: "Match over — \(tally.setsWonA)–\(tally.setsWonB)"
        case let .won(side): "\(board.team(side).name) win"
        }
    }

    // ── Actions ──────────────────────────────────────────────────────────────

    private func score(_ side: Side, _ delta: Int) {
        guard store.change({ $0.score(side, delta) }) else { return }
        WKInterfaceDevice.current().play(delta > 0 ? .click : .directionDown)
    }

    private func endSet() {
        guard let rec = store.change({ $0.endSet() }) else { return }
        WKInterfaceDevice.current().play(.success)
        setPrompt = (UUID(), rec.number, rec.score)
    }

    private func endMatch() {
        guard store.change({ $0.endMatch() }) else { return }
        WKInterfaceDevice.current().play(.success)
        setPrompt = nil
        menuOpen = false
    }

    private func undo() {
        guard store.change({ $0.undo() }) else { return }
        WKInterfaceDevice.current().play(.retry)
        setPrompt = nil
    }

    private func newGame() {
        store.change { _ = $0.reset() }
        setPrompt = nil
        menuOpen = false
    }
}

struct WatchMenu: View {
    let store: BoardStore
    let endMatch: () -> Void
    let newGame: () -> Void

    @State private var confirmingNewGame = false

    var body: some View {
        let board = store.board
        List {
            if !board.tally.over {
                Button { endMatch() } label: { Label("End match", systemImage: "flag.checkered") }
            }
            Button {
                store.change { $0.swapped.toggle() }
            } label: {
                Label("Swap sides", systemImage: "arrow.up.arrow.down")
            }
            Picker("Scoring", selection: Binding(
                get: { store.board.mode },
                set: { mode in store.change { $0.mode = mode } }
            )) {
                Text("Free score").tag(ScoringMode.free)
                Text("Sets").tag(ScoringMode.sets)
            }
            Button(role: .destructive) {
                confirmingNewGame = true
            } label: {
                Label("New game", systemImage: "arrow.counterclockwise")
            }
            .disabled(board.events.isEmpty)
            Text("Team names and colours are set in the iPhone app.")
                .font(.footnote)
                .foregroundStyle(.secondary)
                .listRowBackground(Color.clear)
        }
        // No undo banner on the wrist, so New game asks first.
        .confirmationDialog("Clear the score?", isPresented: $confirmingNewGame) {
            Button("New game", role: .destructive, action: newGame)
        }
    }
}
