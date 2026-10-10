import SwiftUI
import ScoreboardKit

struct TeamEditor: View {
    let store: BoardStore
    let side: Side

    @State private var name = ""
    @FocusState private var nameFocused: Bool

    private let columns = [GridItem(.adaptive(minimum: 52), spacing: 14)]

    var body: some View {
        let team = store.board.team(side)
        Form {
            Section("Team name") {
                TextField("Team name", text: $name)
                    .textInputAutocapitalization(.characters)
                    .autocorrectionDisabled()
                    .submitLabel(.done)
                    .focused($nameFocused)
                    .onChange(of: name) { _, value in
                        let trimmed = String(value.prefix(24))
                        if trimmed != value { name = trimmed }
                        let clean = trimmed.trimmingCharacters(in: .whitespaces)
                        guard !clean.isEmpty, clean != store.board.team(side).name else { return }
                        store.change { $0.setTeam(side, Team(name: clean, color: $0.team(side).color)) }
                    }
            }
            Section("Colour") {
                LazyVGrid(columns: columns, spacing: 14) {
                    ForEach(teamPalette, id: \.self) { hex in
                        let selected = hex.caseInsensitiveCompare(team.color) == .orderedSame
                        Button {
                            Haptics.select()
                            store.change { $0.setTeam(side, Team(name: $0.team(side).name, color: hex)) }
                        } label: {
                            Circle()
                                .fill(Color(hex: hex))
                                .frame(width: 44, height: 44)
                                .overlay {
                                    if selected {
                                        Image(systemName: "checkmark")
                                            .font(.headline.weight(.bold))
                                            .foregroundStyle(.white)
                                    }
                                }
                                .overlay(Circle().stroke(.primary.opacity(selected ? 0.6 : 0), lineWidth: 3).padding(-4))
                        }
                        .buttonStyle(.plain)
                        .accessibilityLabel(colourName(hex))
                        .accessibilityAddTraits(selected ? .isSelected : [])
                    }
                }
                .padding(.vertical, 6)
            }
        }
        .navigationTitle(side == .a ? "Home team" : "Away team")
        .navigationBarTitleDisplayMode(.inline)
        .onAppear { name = team.name }
    }

    private func colourName(_ hex: String) -> String {
        ["#0E9F6E": "Green", "#2563EB": "Blue", "#DC2626": "Red", "#EA580C": "Orange",
         "#7C3AED": "Purple", "#DB2777": "Pink", "#0891B2": "Teal", "#475569": "Slate"][hex.uppercased()] ?? "Colour"
    }
}
