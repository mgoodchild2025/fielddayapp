import UIKit

/// One feel per kind of change, so a scorekeeper can tell them apart without looking.
@MainActor
enum Haptics {
    private static let impact = UIImpactFeedbackGenerator(style: .medium)
    private static let light = UIImpactFeedbackGenerator(style: .light)
    private static let notify = UINotificationFeedbackGenerator()
    private static let selection = UISelectionFeedbackGenerator()

    static func point() { impact.impactOccurred() }
    static func minus() { light.impactOccurred(intensity: 0.7) }
    static func set() { notify.notificationOccurred(.success) }
    static func match() { notify.notificationOccurred(.success) }
    static func select() { selection.selectionChanged() }
    static func refused() { notify.notificationOccurred(.warning) }
}
