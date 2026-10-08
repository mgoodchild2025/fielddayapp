# Fieldday Scoreboard — iPhone + Apple Watch

The native version of the free web scoreboard (`/scoreboard`). Standalone: no
sign-in, nothing leaves the device except the phone ↔ watch sync.

| Path | What |
|------|------|
| `ScoreboardKit/` | Swift package shared by both apps: the event model + fold (`Board.swift`, a port of `components/scoreboard/scoreboard-app.tsx` — same JSON shape), `BoardStore` (persistence in UserDefaults), `BoardSync` (WatchConnectivity). Tests: `swift test`. |
| `Scoreboard/` | iPhone app (SwiftUI). |
| `ScoreboardWatch/` | Apple Watch app (SwiftUI, single-target watch app, embedded in the iPhone app). |
| `project.yml` | XcodeGen spec — the `.xcodeproj` is generated, not committed. |

## Build

```bash
brew install xcodegen          # once
cd ios && xcodegen             # writes FielddayScoreboard.xcodeproj
open FielddayScoreboard.xcodeproj
```

Engine tests (fast, run on the Mac):

```bash
cd ios/ScoreboardKit && swift test
```

## How it behaves (parity with the web board)

- Tap a panel = +1, swipe down ≥ 40pt = −1, hold = edit the team. −/+ buttons in
  the panel corners and VoiceOver adjustable actions (swipe up/down) do the same.
- Set formats are deliberately not modelled: "End set N" (sets mode) and "End match"
  (menu, or the post-set chooser) — End match folds an in-progress set, and Undo
  takes both back.
- Anything that appears after an action (the post-set chooser, "Scores reset · Undo")
  lives in the middle bar, never over a scoring panel.
- Lock: ignores panel taps and −/+ until a 700ms hold (VoiceOver: double-tap).
- The screen never dims while the app is open (`isIdleTimerDisabled`); status bar
  hidden; system edge gestures deferred so a swipe on the top panel isn't Notification Centre.

## Phone ↔ watch sync

Each change bumps a Lamport clock (`Board.rev`) and is sent with `sendMessage`
(when the other app is reachable) and `updateApplicationContext` (always, latest
wins). The receiver adopts a board only if it's newer, so duplicates and
out-of-order deliveries are harmless and the next local change always wins.
Scoring the same match on both devices at the same instant keeps the later one.

## Watch

Two halves (tap +1, swipe down −1), a strip with Undo · End set · menu. Haptics:
click for +1, down for −1, success for set/match. In Always-On (wrist down) the
colours dim and the controls hide. Team names/colours are edited on the iPhone.

watchOS returns to the clock after the user's "Return to Clock" setting (default
2 minutes wrist-down). For long rallies, Settings → General → Return to Clock →
Scoreboard → "After 1 hour" keeps it up. (A workout session would pin it, but
that needs HealthKit and isn't worth it for v1.)

## Releasing

Bundle IDs: `ca.fielddayapp.scoreboard` (iPhone) and
`ca.fielddayapp.scoreboard.watchkitapp` (watch). Team `LM4G49467Q`, automatic signing.

1. Xcode → Settings → Accounts: sign in with the Apple developer account.
2. App Store Connect → Apps → + New App: iOS, name "Fieldday Scoreboard",
   bundle ID `ca.fielddayapp.scoreboard`, SKU e.g. `fieldday-scoreboard`.
3. Archive: Product → Archive (scheme Scoreboard, "Any iOS Device"), then
   Distribute App → App Store Connect. Or from the terminal:
   `xcodebuild -project FielddayScoreboard.xcodeproj -scheme Scoreboard -configuration Release -destination 'generic/platform=iOS' -archivePath build/Scoreboard.xcarchive -allowProvisioningUpdates archive`
4. In App Store Connect: screenshots (6.9" iPhone + Apple Watch), description,
   keywords, support URL, privacy policy URL (`https://fielddayapp.ca/privacy`),
   App Privacy = "Data Not Collected", age rating, category Sports. Submit for review.

Bump `MARKETING_VERSION` / `CURRENT_PROJECT_VERSION` in `project.yml` for each upload.
