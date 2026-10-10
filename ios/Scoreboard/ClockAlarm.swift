import AVFoundation
import ScoreboardKit
import UIKit
import UserNotifications

/// The buzzer: a strong triple haptic, plus the horn when Sound is on.
@MainActor
enum ClockAlarm {
    private static var player: AVAudioPlayer?

    static func fire(sound: Bool) {
        let gen = UINotificationFeedbackGenerator()
        Task { @MainActor in
            for _ in 0..<3 {
                gen.notificationOccurred(.warning)
                try? await Task.sleep(for: .milliseconds(280))
            }
        }
        guard sound, let url = Bundle.main.url(forResource: "horn", withExtension: "wav") else { return }
        // .playback: the scorekeeper turned the horn on, so it sounds even with
        // the ring switch on silent; mixes with whatever else is playing.
        try? AVAudioSession.sharedInstance().setCategory(.playback, options: [.mixWithOthers])
        try? AVAudioSession.sharedInstance().setActive(true)
        player = try? AVAudioPlayer(contentsOf: url)
        player?.play()
    }
}

/// While the app is in the background (phone locked, another app open) the
/// buzzer comes from a scheduled notification at the moment the countdown or
/// timeout reaches zero. Cleared as soon as the app is back on screen.
@MainActor
enum ClockNotifications {
    private static let ids = ["fieldday.clock.time", "fieldday.clock.timeout"]

    /// Asked the first time someone starts a countdown or a timeout.
    static func requestPermissionIfNeeded() {
        let center = UNUserNotificationCenter.current()
        center.getNotificationSettings { settings in
            guard settings.authorizationStatus == .notDetermined else { return }
            center.requestAuthorization(options: [.alert, .sound]) { _, _ in }
        }
    }

    static func schedule(for board: Board, now: Double) {
        cancel()
        let clock = board.clock
        let tally = board.tally
        let score = "\(board.teamA.name) \(tally.a) – \(board.teamB.name) \(tally.b)"
        let sound: UNNotificationSound = clock.sound ? UNNotificationSound(named: UNNotificationSoundName("horn.wav")) : .default

        if clock.mode == .countdown, let since = clock.runningSince {
            let at = since + (clock.lengthMs - clock.accumulatedMs)
            add(id: ids[0], title: "Time's up", body: score, sound: sound, in: at - now)
        }
        if let timeout = clock.timeout {
            let at = timeout.startedAt + clock.timeoutLengthMs
            add(id: ids[1], title: "Timeout over", body: "\(board.team(timeout.side).name) · \(score)", sound: sound, in: at - now)
        }
    }

    static func cancel() {
        UNUserNotificationCenter.current().removePendingNotificationRequests(withIdentifiers: ids)
        UNUserNotificationCenter.current().removeDeliveredNotifications(withIdentifiers: ids)
    }

    private static func add(id: String, title: String, body: String, sound: UNNotificationSound, in ms: Double) {
        guard ms > 500 else { return }
        let content = UNMutableNotificationContent()
        content.title = title
        content.body = body
        content.sound = sound
        content.interruptionLevel = .active
        let trigger = UNTimeIntervalNotificationTrigger(timeInterval: ms / 1000, repeats: false)
        UNUserNotificationCenter.current().add(UNNotificationRequest(identifier: id, content: content, trigger: trigger))
    }
}
