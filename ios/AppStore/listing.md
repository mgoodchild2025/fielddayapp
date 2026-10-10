# App Store listing — Fieldday Scoreboard 1.0

Paste each field into App Store Connect → the app → iOS App 1.0 (and App Information).
Character counts are checked against Apple's limits.

## App Information

| Field | Value |
|---|---|
| Name (30) | Fieldday Scoreboard |
| Subtitle (30) | Tap to score. Swipe to fix. |
| Primary category | Sports |
| Secondary category | Utilities |
| Content rights | Does not contain, show, or access third-party content |
| Age rating | 4+ (answer "None" to every question) |
| Privacy policy URL | https://fielddayapp.ca/privacy |

## Version 1.0

**Promotional text (170)** — can be changed any time without a new build

> A free, no-fuss scoreboard for volleyball, pickleball, basketball and any game with two sides. Game clock and timeouts built in. iPhone and Apple Watch stay in sync.

**Description (4000)**

> The scoreboard you can run with one thumb. Tap a team to add a point, swipe down to take one back. The numbers are big enough to read from across the court.
>
> MADE FOR THE BENCH
> • Tap a side for +1, swipe down for −1, hold to rename a team or change its colour
> • Undo anything, including ending a set or the match
> • Lock the board while it's in your pocket, then hold to unlock
> • The screen stays awake while you're scoring
>
> ANY FORMAT, NO SETUP
> Free score for basketball and anything else that just counts up. Sets for volleyball, pickleball, tennis and badminton. There are no targets or rules to configure: tap End set when a set is over and End match when you're done, so caps, time limits and house rules all just work.
>
> GAME CLOCK & TIMEOUTS
> Turn on a stopwatch or a countdown for timed halves and sets. Tap the clock to start or pause it. Call a timeout for either team: the clock stops, the timeout counts down, and Resume picks the game back up. At 0:00 it buzzes (and sounds a horn if you want one), then offers End set or End match. Nothing ends on its own, and the buzzer still reaches you with the phone locked.
>
> ON YOUR WRIST
> The Apple Watch app is a full scorer: tap a side for a point, swipe down to take one back, and feel a tap for every point. It runs the clock too. Your iPhone and Watch share one board, so you can switch between them mid-game.
>
> NOTHING TO SIGN UP FOR
> No account, no ads, and no data collected. Your games stay on your devices.
>
> Running a league? Fieldday (fielddayapp.ca) handles registration, schedules, standings and payments for sports leagues and tournaments.

**Keywords (100)** — comma-separated, no spaces; don't repeat words already in the name

> score keeper,volleyball,pickleball,basketball,tennis,badminton,spikeball,points,sets,timer,timeout

| Field | Value |
|---|---|
| Support URL | https://fielddayapp.ca/contact |
| Marketing URL | https://fielddayapp.ca/scoreboard |
| Copyright | 2026 Matthew Goodchild *(or your business name, if the account becomes an Organization)* |
| What's New | (not shown for the first version) |

## App Review information

- Sign-in required: **No**
- Notes:
  > No account or sign-in. Open the app and tap either half of the screen to score. In the ⋯ menu, switch Scoring to "Sets" to see End set / End match. The Apple Watch app is a companion: it scores the same board and syncs with the iPhone app via WatchConnectivity.

## App Privacy

Data collection: **"No, we do not collect data from this app."** (Matches `PrivacyInfo.xcprivacy`: no tracking, no collected data types; UserDefaults is used only to keep the current board.)

## Screenshots (`screenshots/`)

| File | Upload to | Size |
|---|---|---|
Suggested upload order (the first three show in search results):

| # | File | Upload to | Size |
|---|---|---|---|
| 1 | iphone-1-midgame.png | iPhone 6.9" display | 1320 × 2868 |
| 2 | iphone-6-clock.png | iPhone 6.9" display | 1320 × 2868 |
| 3 | iphone-2-setended.png | iPhone 6.9" display | 1320 × 2868 |
| 4 | iphone-7-timeout.png | iPhone 6.9" display | 1320 × 2868 |
| 5 | iphone-3-final.png | iPhone 6.9" display | 1320 × 2868 |
| 6 | iphone-4-free.png | iPhone 6.9" display | 1320 × 2868 |
| 7 | iphone-5-teams.png | iPhone 6.9" display | 1320 × 2868 |
| 1 | watch-1-midgame.png | Apple Watch (Ultra) | 422 × 514 |
| 2 | watch-4-clock.png | Apple Watch (Ultra) | 422 × 514 |
| 3 | watch-2-final.png | Apple Watch (Ultra) | 422 × 514 |
| 4 | watch-3-free.png | Apple Watch (Ultra) | 422 × 514 |

App Store Connect scales the 6.9" set down for smaller iPhones, so no other iPhone sizes are needed.
All are opaque PNGs (no alpha), with fictional team names.

To regenerate: build the app into a simulator, then
`AppStore/seed-board.py <simulator-udid> ca.fielddayapp.scoreboard <midgame|setpoint|final|free|dinks|clockshot|timeoutshot>`
relaunches it with that board (passed as a UserDefaults launch argument, so nothing in the app changes).
Use `ca.fielddayapp.scoreboard.watchkitapp` and the Watch simulator's UDID for the Watch shots. Seeded boards carry a
very high `rev`, so they win over any board the paired simulator syncs across.
