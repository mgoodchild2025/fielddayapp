import type { Metadata } from 'next'
import Link from 'next/link'
import { CONTACT_EMAILS } from '@/lib/org-schema'

// The privacy policy URL on the App Store listing for the native Fieldday
// Scoreboard app (iPhone + Apple Watch). It must describe what the APP does
// with data — the general /privacy policy covers league registration and
// payments, which the app never touches. Keep it in step with
// ios/Scoreboard/PrivacyInfo.xcprivacy and the "Data Not Collected" answer in
// App Store Connect.
export const metadata: Metadata = {
  title: 'Fieldday Scoreboard app — Privacy',
  description:
    'The Fieldday Scoreboard app for iPhone and Apple Watch collects no personal data. Scores stay on your devices.',
}

export default function ScoreboardAppPrivacyPage() {
  return (
    <div className="min-h-dvh bg-white">
      <header className="border-b border-gray-100">
        <div className="max-w-4xl mx-auto px-6 py-4 flex items-center justify-between">
          <Link href="/" className="text-sm font-semibold text-gray-900">
            Fieldday
          </Link>
          <Link href="/legal" className="text-sm text-gray-500 hover:text-gray-900 transition-colors">
            All policies
          </Link>
        </div>
      </header>

      <main className="max-w-4xl mx-auto px-6 py-12">
        <div className="mb-8 pb-8 border-b border-gray-100">
          <h1 className="text-3xl font-bold text-gray-900 mb-3">Fieldday Scoreboard app — Privacy</h1>
          <p className="text-sm text-gray-500">For the Fieldday Scoreboard app for iPhone and Apple Watch · Last updated: October 10, 2026</p>
        </div>

        <div className="space-y-8 text-gray-700 leading-relaxed">
          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">The short version</h2>
            <p>
              The Fieldday Scoreboard app does not collect, store or share any personal information.
              There is no account, no sign-in, no advertising, no analytics and no tracking. The app
              does not send anything to Fieldday or to anyone else.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">What stays on your devices</h2>
            <ul className="list-disc pl-6 space-y-2">
              <li>
                <strong>The current game</strong> — team names, colours, scores, sets and clock settings —
                is saved on your iPhone so it survives closing the app. Starting a new game replaces it;
                deleting the app removes it.
              </li>
              <li>
                <strong>iPhone ↔ Apple Watch sync.</strong> When you use both, the board is passed
                directly between your iPhone and your paired Apple Watch using Apple&apos;s
                WatchConnectivity. It does not pass through Fieldday&apos;s servers.
              </li>
              <li>
                <strong>Clock alerts.</strong> If you allow notifications, the app schedules a local
                alert on your iPhone for when a countdown or timeout ends. These are created on the
                device; no notification service of ours is involved.
              </li>
            </ul>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">Links out of the app</h2>
            <p>
              The menu links to fielddayapp.ca. Those pages open in your browser and are covered by the{' '}
              <Link href="/privacy" className="text-gray-900 underline underline-offset-2 hover:no-underline">
                Fieldday privacy policy
              </Link>
              .
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">The web scoreboard</h2>
            <p>
              The free web version at{' '}
              <Link href="/scoreboard" className="text-gray-900 underline underline-offset-2 hover:no-underline">
                fielddayapp.ca/scoreboard
              </Link>{' '}
              is separate from the app. To count how many devices use it, it keeps a random ID in your
              browser and records, for each day it&apos;s opened: how many times, whether it was opened as an
              installed home-screen app, a coarse platform type (such as &ldquo;iOS&rdquo; or
              &ldquo;Android&rdquo;) and, on a league&apos;s own site, which league site it was. It records no
              name, account, IP address or browser details.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">Children</h2>
            <p>
              Because the app collects no personal information, it collects none from children either.
            </p>
          </section>

          <section className="space-y-3">
            <h2 className="text-xl font-semibold text-gray-900">Changes and questions</h2>
            <p>
              If the app ever starts handling personal information, this page will be updated before that
              version is released. Questions go to{' '}
              <a
                href={`mailto:${CONTACT_EMAILS.privacy}`}
                className="text-gray-900 underline underline-offset-2 hover:no-underline"
              >
                {CONTACT_EMAILS.privacy}
              </a>
              .
            </p>
          </section>
        </div>
      </main>
    </div>
  )
}
