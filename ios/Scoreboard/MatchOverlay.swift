import SwiftUI
import ScoreboardKit

/// Shown once the scorekeeper ends the match.
struct MatchOverlay: View {
    let board: Board
    let tally: Tally
    let outcome: Outcome
    let newGame: () -> Void
    let undo: () -> Void

    var body: some View {
        ZStack {
            Color.black.opacity(0.92).ignoresSafeArea()
            VStack(spacing: 10) {
                Image(systemName: outcome == .tie ? "equal.circle.fill" : "trophy.fill")
                    .font(.system(size: 44))
                    .foregroundStyle(outcome == .tie ? .white : Color(hex: "#FBBF24"))
                    .accessibilityHidden(true)
                Text(title)
                    .font(.title.weight(.bold))
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)
                if !tally.sets.isEmpty {
                    Text(tally.sets.map { "\($0.home)–\($0.away)" }.joined(separator: "   "))
                        .font(.title3)
                        .monospacedDigit()
                        .foregroundStyle(.white.opacity(0.6))
                        .accessibilityLabel("Sets: " + tally.sets.map { "\($0.home) to \($0.away)" }.joined(separator: ", "))
                }
                HStack(spacing: 12) {
                    Button(action: newGame) {
                        Label("New game", systemImage: "arrow.counterclockwise")
                            .frame(minHeight: 48)
                            .padding(.horizontal, 20)
                            .background(Color.boardAction, in: RoundedRectangle(cornerRadius: 12))
                    }
                    Button(action: undo) {
                        Label("Undo", systemImage: "arrow.uturn.backward")
                            .frame(minHeight: 48)
                            .padding(.horizontal, 20)
                            .background(.white.opacity(0.12), in: RoundedRectangle(cornerRadius: 12))
                    }
                }
                .buttonStyle(PressScale())
                .font(.headline)
                .foregroundStyle(.white)
                .padding(.top, 14)
            }
            .padding(24)
        }
        .accessibilityAddTraits(.isModal)
    }

    private var title: String {
        switch outcome {
        case .tie: "Match over — \(tally.setsWonA)–\(tally.setsWonB)"
        case let .won(side): "\(board.team(side).name) win the match"
        }
    }
}
