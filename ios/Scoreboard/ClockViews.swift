import SwiftUI
import ScoreboardKit

/// The clock row above the middle bar (only while the clock is on):
/// `[● T/O]  12:34  [T/O ●]`. Tap the clock to start/pause, hold to set it.
/// It turns into the timeout countdown during a timeout, and into the
/// "Time · End set / End match" chooser at 0:00 — nothing ends by itself.
struct ClockRow: View {
    let store: BoardStore
    let vertical: Bool
    /// The countdown run whose time's-up chooser was dismissed.
    let timeUpDismissedFor: Double?
    let endSet: () -> Void
    let endMatch: () -> Void
    let dismissTimeUp: () -> Void
    let openSettings: () -> Void

    @Environment(\.accessibilityReduceMotion) private var reduceMotion

    var body: some View {
        let board = store.board
        let clock = board.clock
        // Ticks only while something is moving; a paused clock doesn't redraw.
        TimelineView(.periodic(from: .now, by: 0.25)) { context in
            let now = context.date.timeIntervalSince1970 * 1000
            let layout = vertical ? AnyLayout(VStackLayout(spacing: 8)) : AnyLayout(HStackLayout(spacing: 8))
            layout {
                if clock.mode == .countdown, let run = clock.runningSince, clock.isExpired(at: now),
                   run != timeUpDismissedFor, clock.timeout == nil, !board.tally.over {
                    timeUpChooser(board: board)
                } else if let timeout = clock.timeout {
                    timeoutView(board: board, timeout: timeout, now: now)
                } else {
                    let order = board.displayOrder
                    timeoutButton(order.first, board: board)
                    if !vertical { Spacer(minLength: 0) }
                    clockFace(clock: clock, now: now)
                    if !vertical { Spacer(minLength: 0) }
                    timeoutButton(order.second, board: board)
                }
            }
        }
        .padding(.horizontal, vertical ? 6 : 10)
        .padding(.top, vertical ? 10 : 6)
        .frame(maxWidth: vertical ? nil : .infinity)
        .background(Color.boardBackground)
    }

    // ── Pieces ────────────────────────────────────────────────────────────────

    private func clockFace(clock: GameClock, now: Double) -> some View {
        let running = clock.isRunning(at: now)
        let expired = clock.isExpired(at: now)
        let text = formatClock(clock.displayMs(at: now), roundingUp: clock.mode == .countdown)
        return Text(text)
            .font(.system(size: vertical ? 22 : 30, weight: .bold, design: .rounded))
            .monospacedDigit()
            .foregroundStyle(expired ? Color(hex: "#F87171") : .white.opacity(running ? 1 : 0.55))
            .opacity(expired && !reduceMotion && Int(now / 500) % 2 == 0 ? 0.35 : 1)
            .padding(.horizontal, 14)
            .frame(minHeight: 44)
            .contentShape(Rectangle())
            .onTapGesture {
                store.changeClock { $0.toggle(at: $1) }
                Haptics.select()
            }
            .onLongPressGesture(minimumDuration: 0.5) { Haptics.select(); openSettings() }
            .accessibilityElement(children: .ignore)
            .accessibilityLabel(clock.mode == .countdown ? "Countdown" : "Stopwatch")
            .accessibilityValue("\(text), \(expired ? "time's up" : running ? "running" : "paused")")
            .accessibilityHint("Double-tap to start or pause.")
            .accessibilityAddTraits(.isButton)
            .accessibilityAction(named: "Set the clock", openSettings)
    }

    private func timeoutButton(_ side: Side, board: Board) -> some View {
        Button {
            store.changeClock { $0.startTimeout(side, at: $1) }
            Haptics.select()
        } label: {
            HStack(spacing: 5) {
                Circle().fill(board.team(side).swiftUIColor).frame(width: 9, height: 9)
                Text("T/O")
            }
            .font(.footnote.weight(.semibold))
            .foregroundStyle(.white)
            .padding(.horizontal, 12)
            .frame(minWidth: 44, minHeight: 44)
            .background(.white.opacity(0.1), in: RoundedRectangle(cornerRadius: 10))
        }
        .buttonStyle(PressScale())
        .disabled(board.tally.over)
        .accessibilityLabel("Timeout, \(board.team(side).name)")
    }

    private func timeoutView(board: Board, timeout: GameClock.Timeout, now: Double) -> some View {
        let left = board.clock.timeoutRemaining(at: now) ?? 0
        let done = left <= 0
        return Group {
            HStack(spacing: 6) {
                Circle().fill(board.team(timeout.side).swiftUIColor).frame(width: 9, height: 9)
                Text("\(board.team(timeout.side).name) · T/O")
                    .lineLimit(1)
                    .truncationMode(.tail)
            }
            .font(.footnote.weight(.bold))
            .foregroundStyle(.white.opacity(0.9))
            Text(formatClock(left, roundingUp: true))
                .font(.system(size: vertical ? 22 : 28, weight: .bold, design: .rounded))
                .monospacedDigit()
                .foregroundStyle(done ? Color(hex: "#F87171") : .white)
                .opacity(done && !reduceMotion && Int(now / 500) % 2 == 0 ? 0.35 : 1)
                .accessibilityLabel("Timeout, \(formatClock(left, roundingUp: true)) left")
            BarButton(title: "Resume", symbol: "play.fill", prominent: done) {
                store.changeClock { $0.endTimeout(at: $1) }
                Haptics.select()
            }
        }
    }

    @ViewBuilder
    private func timeUpChooser(board: Board) -> some View {
        Text("Time")
            .font(.footnote.weight(.heavy))
            .textCase(.uppercase)
            .foregroundStyle(Color(hex: "#F87171"))
        if board.mode == .sets && board.tally.a + board.tally.b > 0 {
            BarButton(title: "End set \(board.tally.sets.count + 1)", prominent: true, action: endSet)
        }
        BarButton(title: "End match", symbol: "flag.checkered", prominent: board.mode != .sets, action: endMatch)
        BarButton(symbol: "xmark", label: "Keep playing", action: dismissTimeUp)
    }
}

/// Clock settings: in the menu and behind a hold on the clock.
struct ClockSettings: View {
    let store: BoardStore

    var body: some View {
        let clock = store.board.clock
        Picker("Clock", selection: Binding(
            get: { store.board.clock.mode },
            set: { mode in
                store.changeClock { c, _ in c.setMode(mode) }
                // Asked here, while setting up — never as a system alert over
                // the board mid-game. Needed for the buzzer on a locked phone.
                if mode != .off { ClockNotifications.requestPermissionIfNeeded() }
            }
        )) {
            Text("Off").tag(GameClock.Mode.off)
            Text("Stopwatch").tag(GameClock.Mode.stopwatch)
            Text("Countdown").tag(GameClock.Mode.countdown)
        }
        .pickerStyle(.segmented)

        if clock.mode == .countdown {
            let minutes = Int(clock.lengthMs / 60_000)
            VStack(alignment: .leading, spacing: 10) {
                Text("Length").font(.subheadline.weight(.medium))
                HStack(spacing: 8) {
                    ForEach(GameClock.lengthPresetsMinutes, id: \.self) { m in
                        Button("\(m)") { store.changeClock { c, _ in c.setLength(minutes: m) } }
                            .buttonStyle(.bordered)
                            .tint(m == minutes ? .accentColor : .secondary)
                            .accessibilityLabel("\(m) minutes")
                            .accessibilityAddTraits(m == minutes ? .isSelected : [])
                    }
                }
                Stepper("\(minutes) min", value: Binding(
                    get: { Int(store.board.clock.lengthMs / 60_000) },
                    set: { m in store.changeClock { c, _ in c.setLength(minutes: m) } }
                ), in: 1...180)
            }
            .padding(.vertical, 4)
        }

        if clock.isOn {
            Picker("Timeout length", selection: Binding(
                get: { store.board.clock.timeoutLengthMs },
                set: { ms in store.changeClock { c, _ in c.timeoutLengthMs = ms } }
            )) {
                Text("30 s").tag(30_000.0)
                Text("60 s").tag(60_000.0)
            }
            Toggle("Horn at zero", isOn: Binding(
                get: { store.board.clock.sound },
                set: { on in store.changeClock { c, _ in c.sound = on } }
            ))
            Button("Reset clock", role: .destructive) { store.changeClock { c, _ in c.reset() } }
                .disabled(clock.runningSince == nil && clock.accumulatedMs == 0)
        }
    }
}

/// Behind a hold on the clock face.
struct ClockSheet: View {
    let store: BoardStore
    let close: () -> Void

    var body: some View {
        NavigationStack {
            Form {
                Section {
                    ClockSettings(store: store)
                } footer: {
                    Text("Tap the clock to start or pause it. At 0:00 it buzzes and offers End set / End match — nothing ends on its own. End set resets a countdown for the next set or half.")
                }
            }
            .navigationTitle("Clock")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar { ToolbarItem(placement: .confirmationAction) { Button("Done", action: close) } }
        }
    }
}
