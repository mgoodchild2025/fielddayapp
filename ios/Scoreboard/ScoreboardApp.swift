import SwiftUI
import ScoreboardKit

@main
struct ScoreboardApp: App {
    @State private var store: BoardStore
    /// Held for the app's lifetime: it owns the WatchConnectivity session.
    @State private var sync: BoardSync

    init() {
        let store = BoardStore()
        _store = State(initialValue: store)
        _sync = State(initialValue: BoardSync(store: store))
    }

    var body: some Scene {
        WindowGroup {
            ScoreboardView(store: store)
                // A scoreboard on a bench must not dim and lock mid-game.
                .onAppear { UIApplication.shared.isIdleTimerDisabled = true }
        }
    }
}
