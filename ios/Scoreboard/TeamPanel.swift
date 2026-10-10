import SwiftUI
import ScoreboardKit

/// One team's half of the board. Tap or swipe up = +1, swipe down ≥ 40pt =
/// −1, hold = edit the team, and the −/+ circles in the bottom corners do what
/// they say. Feedback runs while the finger is down: the panel shades on
/// touch, the number follows a vertical swipe (1:1 to the threshold, then
/// rubber-bands) with a "−1"/"+1" hint that firms up once it will count, and a
/// ring fills under the finger during a hold (from 200ms, so taps never flash it).
///
/// The corner circles are part of THIS gesture, not separate Buttons: the
/// panel's touch tracking starts on touch-down (minimumDistance 0), and SwiftUI
/// handed it touches meant for buttons drawn on top — the "−" scored +1.
struct TeamPanel: View {
    let team: Team
    let points: Int
    let setsWon: Int
    let showSets: Bool
    let locked: Bool
    let flash: Bool
    /// Timeouts this team has taken this set (shown while the clock is on).
    var timeoutsUsed = 0
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
    /// The corner circle a touch started on, if any.
    @State private var corner: Corner?

    private enum Corner { case minus, plus }

    private static let swipeThreshold: CGFloat = 40
    private static let tapSlop: CGFloat = 10
    /// Corner circles: 44pt, 12pt in from the panel's bottom corners; the touch
    /// target reaches 8pt past the circle so a thumb near the edge still counts.
    private static let cornerReach: CGFloat = 12 + 44 + 8

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
                    if timeoutsUsed > 0 {
                        HStack(spacing: 4) {
                            Text("T/O").font(.caption2.weight(.heavy))
                            ForEach(0..<timeoutsUsed, id: \.self) { _ in
                                Circle().stroke(.white, lineWidth: 1.5).frame(width: 7, height: 7)
                            }
                        }
                        .foregroundStyle(.white.opacity(0.8))
                    }
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

                swipeHint("−1", active: dragY > 0)
                    .frame(maxHeight: .infinity, alignment: .top)
                    .padding(.top, 12)
                swipeHint("+1", active: dragY < 0)
                    .frame(maxHeight: .infinity, alignment: .bottom)
                    .padding(.bottom, 16)

                holdRing
            }
            .contentShape(Rectangle())
            .gesture(scoringGesture(in: geo.size), including: locked ? .subviews : .all)
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
        if timeoutsUsed > 0 { v += ", \(timeoutsUsed) \(timeoutsUsed == 1 ? "timeout" : "timeouts") taken" }
        return v
    }

    private var followOffset: CGFloat {
        let distance = abs(dragY)
        let follow = distance <= Self.swipeThreshold ? distance : Self.swipeThreshold + rubberband(distance - Self.swipeThreshold)
        return dragY < 0 ? -follow : follow
    }

    /// "−1" above the number while pulling down, "+1" below it while pushing up.
    private func swipeHint(_ text: String, active: Bool) -> some View {
        // Up counts from the tap slop (+1 is cheap); down needs the full threshold.
        let armed = active && abs(dragY) >= (dragY < 0 ? Self.tapSlop : Self.swipeThreshold)
        return Text(text)
            .font(.title3.weight(.bold))
            .monospacedDigit()
            .foregroundStyle(.white)
            .padding(.horizontal, 16)
            .padding(.vertical, 6)
            .background(.black.opacity(armed ? 0.45 : 0.25), in: Capsule())
            .opacity(active && abs(dragY) > Self.tapSlop ? (armed ? 1 : 0.5) : 0)
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
                cornerButton("minus", pressed: corner == .minus, label: "Remove a point from \(team.name)") { onScore(-1) }
                Spacer(minLength: 0)
                cornerButton("plus", pressed: corner == .plus, label: "Add a point to \(team.name)") { onScore(1) }
            }
            .padding(12)
        }
        // Touches go to the panel's gesture, which handles the corners itself.
        .allowsHitTesting(false)
    }

    private func cornerButton(_ symbol: String, pressed: Bool, label: String, action: @escaping () -> Void) -> some View {
        Image(systemName: symbol)
            .font(.title3.weight(.bold))
            .foregroundStyle(.white)
            .frame(width: 44, height: 44)
            .background(.white.opacity(pressed ? 0.35 : 0.15), in: Circle())
            .scaleEffect(pressed && !reduceMotion ? 0.92 : 1)
            .opacity(pressed ? 0.9 : 0.45)
            .animation(.snappy(duration: 0.12), value: pressed)
            // VoiceOver / Switch Control still get real buttons.
            .accessibilityElement()
            .accessibilityLabel(label)
            .accessibilityAddTraits(.isButton)
            .accessibilityAction { if !locked { action() } }
    }

    // ── The gesture machine ──────────────────────────────────────────────────

    private func scoringGesture(in size: CGSize) -> some Gesture {
        DragGesture(minimumDistance: 0, coordinateSpace: .local)
            .onChanged { value in
                if !touching { begin(at: value.startLocation, in: size) }
                guard !held else { return }
                let t = value.translation
                if !moved && hypot(t.width, t.height) > Self.tapSlop {
                    moved = true
                    cancelHold()
                }
                // A press on a corner circle doesn't drag the number.
                if corner == nil { dragY = t.height }
            }
            .onEnded { value in
                let wasHeld = held
                let pressed = corner
                cancelHold()
                defer { finish() }
                guard !wasHeld, !locked else { return }
                let t = value.translation
                if let pressed {
                    // Count it if the finger stayed roughly on the circle.
                    if hypot(t.width, t.height) < 24 { onScore(pressed == .minus ? -1 : 1) }
                    return
                }
                if t.height >= Self.swipeThreshold && abs(t.width) < t.height {
                    onScore(-1)
                } else if !moved || (t.height < 0 && abs(t.width) < -t.height) {
                    // A tap, or any mostly-upward swipe: a tap that drifted up
                    // used to count as nothing.
                    onScore(1)
                }
            }
    }

    private func begin(at point: CGPoint, in size: CGSize) {
        touching = true
        touchPoint = point
        moved = false
        held = false
        dragY = 0
        corner = nil
        guard !locked else { return }
        if point.y >= size.height - Self.cornerReach {
            if point.x <= Self.cornerReach { corner = .minus; return }
            if point.x >= size.width - Self.cornerReach { corner = .plus; return }
        }
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
        corner = nil
        if dragY != 0 {
            withAnimation(reduceMotion ? nil : .spring(duration: 0.3, bounce: 0)) { dragY = 0 }
        }
    }

    /// Resistance past the −1 threshold: the further the pull, the less it follows.
    private func rubberband(_ overshoot: CGFloat, dimension: CGFloat = 200, constant: CGFloat = 0.55) -> CGFloat {
        (overshoot * dimension * constant) / (dimension + constant * abs(overshoot))
    }
}
