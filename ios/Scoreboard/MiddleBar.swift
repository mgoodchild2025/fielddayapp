import SwiftUI
import ScoreboardKit

/// The bar between the panels. The post-"End set" chooser lives HERE, never
/// over a scoring panel, where the next point's tap could land on End match.
struct MiddleBar: View {
    let vertical: Bool
    let board: Board
    let tally: Tally
    let locked: Bool
    let setPrompt: SetPrompt?
    let endSet: () -> Void
    let endMatch: () -> Void
    let playOn: () -> Void
    let undo: () -> Void
    let swap: () -> Void
    let openMenu: () -> Void
    let lock: () -> Void
    let unlock: () -> Void
    /// Set for a few seconds after New game: "Scores reset · Undo" lives here,
    /// not in a banner over a panel, where a tap meant for it scores a point.
    let undoReset: (() -> Void)?

    var body: some View {
        let layout = vertical ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 6))
        layout {
            if let prompt = setPrompt, !tally.over {
                Text("Set \(prompt.number)  \(prompt.score.home)–\(prompt.score.away) ✓")
                    .font(.footnote.weight(.bold))
                    .monospacedDigit()
                    .foregroundStyle(.white.opacity(0.9))
                    .lineLimit(1)
                BarButton(title: "Play on", action: playOn)
                BarButton(title: "End match", symbol: "flag.checkered", prominent: true, action: endMatch)
            } else if locked {
                HoldToUnlock(unlock: unlock)
            } else if let undoReset {
                Text("Scores reset")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.white.opacity(0.9))
                BarButton(title: "Undo", symbol: "arrow.uturn.backward", label: "Undo New game", prominent: true, action: undoReset)
            } else {
                if board.mode == .sets {
                    BarButton(title: "End set \(tally.sets.count + 1)", prominent: true, action: endSet)
                        .disabled(tally.a + tally.b == 0 || tally.over)
                }
                BarButton(title: vertical ? nil : "Undo", symbol: "arrow.uturn.backward", label: "Undo last score change", action: undo)
                    .disabled(board.events.isEmpty)
                BarButton(symbol: "arrow.left.arrow.right", label: "Swap sides", action: swap)
                BarButton(symbol: "ellipsis", label: "Menu", action: openMenu)
                BarButton(symbol: "lock.fill", label: "Lock the board", hint: "Ignores taps until you hold to unlock — for a phone in a pocket.", action: lock)
            }
        }
        .padding(.horizontal, vertical ? 6 : 10)
        .padding(.vertical, vertical ? 10 : 6)
        .frame(maxWidth: vertical ? nil : .infinity, maxHeight: vertical ? .infinity : nil)
        .background(Color.boardBackground)
        .animation(.snappy(duration: 0.2), value: setPrompt?.id)
        .animation(.snappy(duration: 0.2), value: locked)
        .animation(.snappy(duration: 0.2), value: undoReset == nil)
    }
}

struct BarButton: View {
    var title: String?
    var symbol: String?
    var label: String?
    var hint: String?
    var prominent = false
    let action: () -> Void

    @Environment(\.isEnabled) private var isEnabled

    var body: some View {
        Button(action: action) {
            HStack(spacing: 5) {
                if let symbol { Image(systemName: symbol) }
                if let title { Text(title).lineLimit(1) }
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(minWidth: 44, minHeight: 44)
            .background(background, in: RoundedRectangle(cornerRadius: 10))
            .opacity(isEnabled ? 1 : 0.35)
            .contentShape(Rectangle())
        }
        .buttonStyle(PressScale())
        .accessibilityLabel(label ?? title ?? "")
        .accessibilityHint(hint ?? "")
    }

    private var background: Color {
        prominent && isEnabled ? Color.boardAction : .white.opacity(0.1)
    }
}

/// 0.97 while held — feedback on press, not release.
struct PressScale: ButtonStyle {
    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    func makeBody(configuration: Configuration) -> some View {
        configuration.label
            .scaleEffect(configuration.isPressed && !reduceMotion ? 0.97 : 1)
            .animation(.snappy(duration: 0.16), value: configuration.isPressed)
    }
}

/// "Hold to unlock" — a deliberate 700ms press, so a pocket tap can't do it.
struct HoldToUnlock: View {
    let unlock: () -> Void
    @State private var holding = false

    var body: some View {
        HStack(spacing: 6) {
            Image(systemName: "lock.open.fill")
            Text("Hold to unlock")
        }
        .font(.subheadline.weight(.semibold))
        .foregroundStyle(.white)
        .padding(.horizontal, 16)
        .frame(minHeight: 44)
        .background(
            RoundedRectangle(cornerRadius: 10)
                .fill(holding ? Color.boardAction : .white.opacity(0.15))
                .animation(.linear(duration: holding ? 0.7 : 0.15), value: holding)
        )
        .onLongPressGesture(minimumDuration: 0.7) {
            holding = false
            unlock()
        } onPressingChanged: { pressing in
            holding = pressing
        }
        // VoiceOver: a double-tap unlocks (holding is hard to do with VoiceOver on).
        .accessibilityElement(children: .ignore)
        .accessibilityLabel("Board locked")
        .accessibilityAddTraits(.isButton)
        .accessibilityHint("Unlocks the board")
        .accessibilityAction { unlock() }
    }
}
