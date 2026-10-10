# Google Play listing — Fieldday Scoreboard 1.0 (Android)

Paste each field into Play Console → the app. Character counts are checked against Play's limits.
The Android app is the web scoreboard in a Trusted Web Activity, so the copy describes the WEB board's features.
It has no Watch app, and its buzzer can't sound on a locked phone.

## Create app

| Field | Value |
|---|---|
| App name (30) | Fieldday Scoreboard |
| Default language | English (Canada) — en-CA |
| App or game | App |
| Free or paid | Free |
| Package (from the uploaded bundle) | ca.fielddayapp.scoreboard |

## Main store listing

**Short description (80)**

> Tap to score, swipe to fix. A free scoreboard with a game clock and timeouts.

**Full description (4000)**

> The scoreboard you can run with one thumb. Tap a team to add a point, swipe down to take one back. The numbers are big enough to read from across the court.
>
> MADE FOR THE BENCH
> • Tap a side for +1, swipe down for −1, hold to rename a team or change its colour
> • Undo anything, including ending a set or the match
> • Lock the board while it's in your pocket, then hold to unlock
> • The screen stays awake while you're scoring
> • Works offline once it has opened
>
> ANY FORMAT, NO SETUP
> Free score for basketball and anything else that just counts up. Sets for volleyball, pickleball, tennis and badminton. There are no targets or rules to configure: tap End set when a set is over and End match when you're done, so caps, time limits and house rules all just work.
>
> GAME CLOCK & TIMEOUTS
> Turn on a stopwatch or a countdown for timed halves and sets. Tap the clock to start or pause it. Call a timeout for either team: the clock stops, the timeout counts down, and Resume picks the game back up. At 0:00 it vibrates (and sounds a horn if you want one), then offers End set or End match. Nothing ends on its own. Keep the screen on for the buzzer.
>
> NOTHING TO SIGN UP FOR
> No account and no ads. Your games stay on your phone.
>
> Running a league? Fieldday (fielddayapp.ca) handles registration, schedules, standings and payments for sports leagues and tournaments.

| Field | Value |
|---|---|
| App icon | `icon-512.png` (512 × 512) |
| Feature graphic | `feature-graphic.png` (1024 × 500) |
| Phone screenshots | `screenshots/phone-1-midgame.png` … `phone-5-free.png` (1080 × 2041), in that order |
| Category | Sports |
| Tags | Sports, Tools (pick what Play offers that fits) |
| Contact email (shown publicly) | support@fielddayapp.ca |
| Website | https://fielddayapp.ca/scoreboard |

Tablet screenshots are optional. Without them, Play shows the phone set.

## App content (Policy → App content)

- **Privacy policy:** https://fielddayapp.ca/privacy/scoreboard
- **Ads:** No, the app contains no ads.
- **App access:** All functionality is available without special access (no login).
- **Content rating:** answer the IARC questionnaire. Category is "Utility, Productivity, Communication, or Other". Answer **No** to everything: no violence, no user-generated content shared with others, no chat, no location sharing, no purchases. Expect "Everyone" / PEGI 3.
- **Target audience:** 13 and over (13–15, 16–17, 18+). Choosing under-13 brings in the Families policy, which this app doesn't need.
- **News app:** No. **Government app:** No. **Financial features:** None. **Health:** None.
- **Data safety:** see below.

## Data safety

The Android app runs the web scoreboard, which records anonymous launch counts. These rows live in
`scoreboard_launch_logs` (see `actions/scoreboard-metrics.ts`). So unlike the iPhone app, the answer is
"yes, some data is collected":

- Does your app collect or share any of the required user data types? **Yes**
- Is all of the user data collected by your app encrypted in transit? **Yes** (HTTPS)
- Do you provide a way for users to request that their data is deleted? **No** (the data is anonymous: a random ID with no account behind it, and clearing the app's storage resets it)
- **Data types collected** (none are shared):

  | Type | Collected | Shared | Processed ephemerally | Required | Purpose |
  |---|---|---|---|---|---|
  | Device or other IDs | Yes: a random ID the app generates, not a hardware or advertising ID | No | No | Required | Analytics |
  | App activity → App interactions | Yes: how many times a day it's opened, and whether it was opened as an installed app | No | No | Required | Analytics |

Nothing else is collected: no name, email, location, contacts, IP address or browser details.

## Release

New personal developer accounts must run a **closed test** before production: at least **12 testers opted in
for 14 days straight**. Then apply for production access in the Dashboard.

1. Testing → Closed testing → create a track. Upload `app-release.aab`
   (`android/app/build/outputs/bundle/release/`). Add testers by email list or Google Group, and share the opt-in link.
2. After the first upload: Test and release → App integrity → App signing. Copy the **App signing key
   SHA-256** into `public/.well-known/assetlinks.json` (next to the upload key's) and deploy. Without it,
   Play-installed copies show a browser address bar.
3. After 14 days with 12+ testers, apply for production and promote the release.
