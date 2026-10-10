import SwiftUI
import ScoreboardKit

struct MenuSheet: View {
    let store: BoardStore
    let endMatch: () -> Void
    let newGame: () -> Void
    let close: () -> Void

    var body: some View {
        let board = store.board
        NavigationStack {
            List {
                // What people open the menu for mid-game comes first; setup
                // (scoring mode, teams) is usually done once, before play.
                Section {
                    if !board.tally.over {
                        Button(action: endMatch) {
                            Label("End match", systemImage: "flag.checkered")
                        }
                    }
                    Button(role: .destructive, action: newGame) {
                        Label("New game", systemImage: "arrow.counterclockwise")
                    }
                    .disabled(board.events.isEmpty)
                } footer: {
                    Text("New game clears the score and keeps the teams. You can undo it for a few seconds.")
                }

                Section {
                    Picker("Scoring", selection: Binding(
                        get: { store.board.mode },
                        set: { mode in store.change { $0.mode = mode } }
                    )) {
                        Text("Free score").tag(ScoringMode.free)
                        Text("Sets").tag(ScoringMode.sets)
                    }
                    .pickerStyle(.segmented)
                } header: {
                    Text("Scoring")
                } footer: {
                    Text("Sets adds an End set button. There are no targets to set up: you end a set or the match when it's over, so any format works.")
                }

                Section {
                    ClockSettings(store: store)
                } header: {
                    Text("Clock")
                } footer: {
                    Text("Tap the clock to start or pause, hold it to change the length. At 0:00 it buzzes and offers End set / End match. Timeouts pause a running clock.")
                }

                // Teams last; the About links ride in its footer so Teams
                // stays the bottom section.
                Section {
                    ForEach(Side.allCases) { side in
                        NavigationLink {
                            TeamEditor(store: store, side: side)
                        } label: {
                            HStack(spacing: 12) {
                                Circle().fill(board.team(side).swiftUIColor).frame(width: 22, height: 22)
                                Text(board.team(side).name)
                            }
                        }
                    }
                } header: {
                    Text("Teams")
                } footer: {
                    VStack(alignment: .leading, spacing: 6) {
                        HStack(spacing: 6) {
                            Link("Run your league on Fieldday", destination: URL(string: "https://fielddayapp.ca")!)
                            Text("·")
                            Link("Privacy", destination: URL(string: "https://fielddayapp.ca/privacy/scoreboard")!)
                        }
                        Text("Version \(Bundle.main.versionString)")
                    }
                    .padding(.top, 6)
                }
            }
            .navigationTitle("Scoreboard")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) { Button("Done", action: close) }
            }
        }
    }
}

extension Bundle {
    var versionString: String {
        let v = infoDictionary?["CFBundleShortVersionString"] as? String ?? "1.0"
        let b = infoDictionary?["CFBundleVersion"] as? String ?? "1"
        return "\(v) (\(b))"
    }
}
