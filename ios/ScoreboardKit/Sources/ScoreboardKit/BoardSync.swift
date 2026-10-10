#if canImport(WatchConnectivity)
import Foundation
import WatchConnectivity

/// Keeps the iPhone and Apple Watch boards in step.
///
/// Every local change goes two ways: `sendMessage` when the other app is
/// reachable (arrives in well under a second) and `updateApplicationContext`
/// always (latest-state-wins, delivered when the other app next runs). The
/// receiver adopts a board only when it's newer (`Board.isOlder(than:)`), so
/// duplicates and out-of-order deliveries are harmless.
@MainActor
public final class BoardSync: NSObject {
    private let store: BoardStore
    private let session: WCSession?

    public init(store: BoardStore) {
        self.store = store
        session = WCSession.isSupported() ? WCSession.default : nil
        super.init()
        store.onLocalChange = { [weak self] board in self?.send(board) }
        session?.delegate = self
        session?.activate()
    }

    private func send(_ board: Board) {
        guard let session, session.activationState == .activated,
              let data = try? JSONEncoder().encode(board)
        else { return }
        #if os(iOS)
        guard session.isPaired, session.isWatchAppInstalled else { return }
        #endif
        let payload: [String: Any] = ["board": data]
        if session.isReachable {
            session.sendMessage(payload, replyHandler: nil, errorHandler: nil)
        }
        try? session.updateApplicationContext(payload)
    }

    fileprivate func receive(_ data: Data) {
        guard let board = try? JSONDecoder().decode(Board.self, from: data) else { return }
        store.adopt(board)
    }

    fileprivate func activated() {
        guard let session else { return }
        // Pick up whatever the other device left while this app was closed,
        // then offer ours (the other side keeps whichever is newer).
        if let data = session.receivedApplicationContext["board"] as? Data { receive(data) }
        send(store.board)
    }
}

extension BoardSync: WCSessionDelegate {
    nonisolated public func session(_ session: WCSession, activationDidCompleteWith activationState: WCSessionActivationState, error: Error?) {
        guard activationState == .activated else { return }
        Task { @MainActor in self.activated() }
    }

    nonisolated public func session(_ session: WCSession, didReceiveMessage message: [String: Any]) {
        guard let data = message["board"] as? Data else { return }
        Task { @MainActor in self.receive(data) }
    }

    nonisolated public func session(_ session: WCSession, didReceiveApplicationContext applicationContext: [String: Any]) {
        guard let data = applicationContext["board"] as? Data else { return }
        Task { @MainActor in self.receive(data) }
    }

    /// The watch app opened or came into range: bring it up to date.
    nonisolated public func sessionReachabilityDidChange(_ session: WCSession) {
        guard session.isReachable else { return }
        Task { @MainActor in self.send(self.store.board) }
    }

    #if os(iOS)
    nonisolated public func sessionDidBecomeInactive(_ session: WCSession) {}

    /// Switching to another paired watch: activate again for the new one.
    nonisolated public func sessionDidDeactivate(_ session: WCSession) {
        session.activate()
    }

    nonisolated public func sessionWatchStateDidChange(_ session: WCSession) {
        Task { @MainActor in self.send(self.store.board) }
    }
    #endif
}
#endif
