import SwiftUI
import ScoreboardKit

@main
struct ScoreboardWatchApp: App {
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
            WatchBoardView(store: store)
        }
    }
}
