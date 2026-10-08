#if canImport(SwiftUI)
import SwiftUI

public extension Color {
    /// "#RRGGBB" → Color. Anything unparseable falls back to the first team colour.
    init(hex: String) {
        var s = hex.trimmingCharacters(in: .whitespaces)
        if s.hasPrefix("#") { s.removeFirst() }
        let value = UInt32(s, radix: 16) ?? 0x0E9F6E
        self.init(
            red: Double((value >> 16) & 0xFF) / 255,
            green: Double((value >> 8) & 0xFF) / 255,
            blue: Double(value & 0xFF) / 255
        )
    }

    /// The board's background (matches the web board's #0B1210).
    static let boardBackground = Color(hex: "#0B1210")
    /// Fieldday's emerald for primary actions on the board.
    static let boardAction = Color(hex: "#059669")
}

public extension Team {
    var swiftUIColor: Color { Color(hex: color) }
}

/// A panel fill: the team colour darkening toward the bottom (to 72%, like
/// the web board's color-mix).
public struct PanelFill: View {
    let team: Team

    public init(_ team: Team) { self.team = team }

    public var body: some View {
        team.swiftUIColor
            .overlay(LinearGradient(colors: [.clear, .black.opacity(0.28)], startPoint: .top, endPoint: .bottom))
    }
}
#endif
