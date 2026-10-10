# Fieldday Scoreboard — Android

A **Trusted Web Activity** (TWA): the Android app opens the web scoreboard at
`https://fielddayapp.ca/scoreboard` full-screen in the phone's browser engine
(Chrome), with no address bar. There is no app code. Every feature, fix and
deploy of the web scoreboard ships to Android automatically, with no new build.
The library is Google's `androidbrowserhelper` (`LauncherActivity`).

The iPhone/Watch app in `../ios` is separate native code; this is not a port of it.

## How Android trusts the site

Digital Asset Links, both halves must agree:

- **Site:** `public/.well-known/assetlinks.json` lists the package
  (`ca.fielddayapp.scoreboard`) and the SHA-256 fingerprints of every key that
  signs the app.
- **App:** `asset_statements` in `res/values/strings.xml` names `https://fielddayapp.ca`.

If they don't match, the app still opens, but with a browser address bar on top.

**After the first upload to Play:** Play re-signs the app with its own *app
signing key*. Copy that key's SHA-256 from Play Console → Test and release →
App integrity → App signing, and **add** it to `sha256_cert_fingerprints` in
`assetlinks.json`. Keep the upload key's fingerprint there too, so locally
built APKs keep working. Deploy the site.

## Build

Needs JDK 17 and the Android SDK (platform 36, build-tools 36):

```bash
brew install openjdk@17 && brew install --cask android-commandlinetools
sdkmanager "platforms;android-36" "build-tools;36.0.0" "platform-tools"
```

```bash
export JAVA_HOME=/opt/homebrew/opt/openjdk@17 ANDROID_HOME=/opt/homebrew/share/android-commandlinetools
./gradlew bundleRelease     # app/build/outputs/bundle/release/app-release.aab → upload to Play
./gradlew assembleRelease   # app/build/outputs/apk/release/app-release.apk → sideload for testing
```

Use the wrapper (Gradle 8.14.3). A system Gradle 9.6+ can't load AGP 8.x.

**Bump `versionCode`** in `app/build.gradle.kts` for every upload. Play refuses
a repeat. `versionName` is the version people see.

## Signing

The upload key is **never in the repo**. It lives in
`~/.android-keys/fieldday-scoreboard-upload.jks`, with its password in
`fieldday-scoreboard-upload.properties` next to it. Back that folder up to a
password manager. Point `FIELDDAY_UPLOAD_KEY_PROPERTIES` at another
properties file to sign elsewhere. Without the key, the release build comes out
unsigned. A lost upload key can be reset through Play Console support, because
Play holds the real app signing key.

## Store listing

Copy, screenshots and the Data safety answers are in `PlayStore/`.
