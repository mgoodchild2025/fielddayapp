import SwiftUI
import ScoreboardKit

/// One team's half of the board. Tap = +1, swipe down ≥ 40pt = −1, hold =
/// edit the team. Feedback runs while the finger is down: the panel shades on
/// touch, the number follows a downward swipe (1:1 to the threshold, then
/// rubber-bands) with a "−1" hint that firms up once it will count, and a ring
/// fills under the finger during a hold (from 200ms, so taps never flash it).
struct TeamPanel: View {
    let team: Team
    let points: Int
    let setsWon: Int
    let showSets: Bool
    let locked: Bool
    let flash: Bool
    let onScore: (Int) -> Void
    let onEdit: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    // Gesture state
    @State private var touching = false
    @State private var touchPoint: CGPoint = .zero
    @State private var dragY: CGFloat = 0
    @State private var moved = false
    @State private var held = false
    @State private var holdProgress: CGFloat = 0
    @State private var holdTask: Task<Void, Never>?

    private static let swipeThreshold: CGFloat = 40
    private static let tapSlop: CGFloat = 10

    var body: some View {
        ZStack {
            scoringSurface
            cornerButtons
        }
        .background { PanelFill(team).ignoresSafeArea() }
    }

    // The tappable surface. The −/+ buttons are siblings on top, never
    // children, so a press on them is a button press, not a panel tap.
    private var scoringSurface: some View {
        GeometryReader { geo in
            let size = min(geo.size.height * 0.62, geo.size.width * 0.5)
            ZStack {
                // Edge to edge, like the fill: stopping at the safe area left
                // a lighter band under the Dynamic Island while pressed.
                Color.black.opacity(touching && !locked ? 0.15 : 0)
                    .ignoresSafeArea()
                    .animation(.easeOut(duration: 0.1), value: touching)

                VStack(spacing: 6) {
                    Text(team.name)
                        .font(.system(size: 15, weight: .bold))
                        .tracking(2)
                        .textCase(.uppercase)
                        .foregroundStyle(.white.opacity(0.85))
                        .lineLimit(1)
                        .padding(.horizontal, 16)
                    Text("\(points)")
                        .font(.system(size: size, weight: .bold, design: .rounded))
                        .monospacedDigit()
                        .lineLimit(1)
                        .minimumScaleFactor(0.4)
                        .foregroundStyle(.white)
                        .shadow(color: .black.opacity(0.35), radius: 12, y: 4)
                        .contentTransition(reduceMotion ? .identity : .numericText(value: Double(points)))
                        .scaleEffect(flash && !reduceMotion ? 1.06 : 1)
                        .animation(.snappy(duration: 0.15), value: flash)
                        .offset(y: reduceMotion ? 0 : followOffset)
                    if showSets && setsWon > 0 {
                        HStack(spacing: 6) {
                            ForEach(0..<setsWon, id: \.self) { _ in
                                Circle().fill(.white).frame(width: 10, height: 10)
                            }
                        }
                    }
                }
                .frame(maxWidth: .infinity, maxHeight: .infinity)

                minusHint
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 12)

                holdRing
            }
            .contentShape(Rectangle())
            .gesture(scoringGesture, including: locked ? .subviews : .all)
        }
        .accessibilityElement(children: .ignore)
        .accessibilityLabel(team.name)
        .accessibilityValue(accessibilityValue)
        .accessibilityAdjustableAction { direction in
            guard !locked else { return }
            switch direction {
            case .increment: onScore(1)
            case .decrement: onScore(-1)
            @unknown default: break
            }
        }
        .accessibilityAction(named: "Edit team", onEdit)
    }

    private var accessibilityValue: String {
        var v = "\(points) \(points == 1 ? "point" : "points")"
        if showSets { v += ", \(setsWon) \(setsWon == 1 ? "set" : "sets") won" }
        return v
    }

    private var followOffset: CGFloat {
        guard dragY > 0 else { return 0 }
        if dragY <= Self.swipeThreshold { return dragY }
        return Self.swipeThreshold + rubberband(dragY - Self.swipeThreshold)
    }

    private var minusHint: some View {
        let armed = dragY >= Self.swipeThreshold
        return Text("−1")
            .font(.title3.weight(.bold))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(.black.opacity(armed ? 0.45 : 0.25), in: Capsule())
            .opacity(dragY > Self.tapSlop ? (armed ? 1 : 0.5) : 0)
            .scaleEffect(armed ? 1 : 0.92)
            .animation(.snappy(duration: 0.12), value: armed)
            .accessibilityHidden(true)
    }

    private var holdRing: some View {
        ZStack {
            Circle().stroke(.white.opacity(0.25), lineWidth: 5)
            Circle()
                .trim(from: 0, to: holdProgress)
                .stroke(.white, style: StrokeStyle(lineWidth: 5, lineCap: .round))
                .rotationEffect(.degrees(-90))
        }
        .frame(width: 68, height: 68)
        .opacity(holdProgress > 0 ? 1 : 0)
        .position(touchPoint)
        .allowsHitTesting(false)
        .accessibilityHidden(true)
    }

    private var cornerButtons: some View {
        VStack {
            Spacer(minLength: 0)
            HStack {
                cornerButton("minus", label: "Remove a point from \(team.name)") { onScore(-1) }
                Spacer(minLength: 0)
                cornerButton("plus", label: "Add a point to \(team.name)") { onScore(1) }
            }
            .padding(12)
        }
    }

    private func cornerButton(_ symbol: String, label: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: symbol)
                .font(.title3.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.white.opacity(0.15), in: Circle())
        }
        .buttonStyle(.plain)
        .opacity(0.45)
        .disabled(locked)
        .accessibilityLabel(label)
    }

    // ── The gesture machine ──────────────────────────────────────────────────

    private var scoringGesture: some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                if !touching { begin(at: value.startLocation) }
                guard !held else { return }
                let t = value.translation
                if !moved && hypot(t.width, t.height) > Self.tapSlop {
                    moved = true
                    cancelHold()
                }
                dragY = max(0, t.height)
            }
            .onEnded { value in
                let wasHeld = held
                cancelHold()
                defer { finish() }
                guard !wasHeld, !locked else { return }
                let t = value.translation
                if t.height >= Self.swipeThreshold && abs(t.width) < t.height {
                    onScore(-1)
                } else if !moved {
                    onScore(1)
                }
            }
    }

    private func begin(at point: CGPoint) {
        touching = true
        touchPoint = point
        moved = false
        held = false
        dragY = 0
        guard !locked else { return }
        holdTask = Task { @MainActor in
            try? await Task.sleep(for: .milliseconds(200))
            guard !Task.isCancelled else { return }
            withAnimation(.linear(duration: 0.35)) { holdProgress = 1 }
            try? await Task.sleep(for: .milliseconds(350))
            guard !Task.isCancelled else { return }
            held = true
            holdProgress = 0
            touching = false
            Haptics.select()
            onEdit()
        }
    }

    private func cancelHold() {
        holdTask?.cancel()
        holdTask = nil
        if holdProgress > 0 {
            withAnimation(.easeOut(duration: 0.12)) { holdProgress = 0 }
        }
    }

    private func finish() {
        touching = false
        held = false
        moved = false
        if dragY > 0 {
            withAnimation(reduceMotion ? nil : .spring(duration: 0.3, bounce: 0)) { dragY = 0 }
        }
    }

    /// Resistance past the −1 threshold: the further the pull, the less it follows.
    private func rubberband(_ overshoot: CGFloat, dimension: CGFloat = 200, constant: CGFloat = 0.55) -> CGFloat {
        (overshoot * dimension * constant) / (dimension + constant * abs(overshoot))
    }
}
