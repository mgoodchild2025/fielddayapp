#!/usr/bin/env node
/**
 * Cron runner for Railway.
 *
 * Railway schedules a SERVICE, not a URL: it starts the container, runs this
 * script, and expects the process to exit. So this calls the app's existing
 * /api/cron/* endpoints (the same ones cron-job.org hits) and exits non-zero
 * if any of them fail, which is what marks the run failed in Railway.
 *
 * Cron service setup (all dashboard settings — no config file; Railway
 * deprecated config-as-code and new services cannot opt in):
 *   Variables:       RAILWAY_DOCKERFILE_PATH=Dockerfile.cron, CRON_SECRET=<same as web>
 *   Start command:   node scripts/run-cron.mjs <jobs…>
 *   Cron schedule:   UTC, at least 5 minutes apart
 *   Restart policy:  Never (a failed run is reported, then retried on schedule)
 *
 * Usage:  node scripts/run-cron.mjs reminders
 *         node scripts/run-cron.mjs cleanup-exports data-retention hibernate-resume
 *
 * Env:
 *   CRON_SECRET    required — sent as `Authorization: Bearer <secret>`, must
 *                  match the web service's CRON_SECRET.
 *   CRON_BASE_URL  the app's PUBLIC origin (default https://fielddayapp.ca).
 *                  Must be public: the proxy resolves an org from the Host
 *                  header and 404s anything it doesn't recognise, so Railway's
 *                  private *.railway.internal hostname will NOT work.
 *   CRON_TIMEOUT_MS  per-job timeout (default 600000 — the reminders pass does
 *                  a lot of work in one request).
 */

const JOBS = ['reminders', 'cleanup-exports', 'data-retention', 'hibernate-resume']

const SECRET = process.env.CRON_SECRET
const BASE_URL = (process.env.CRON_BASE_URL ?? 'https://fielddayapp.ca').replace(/\/+$/, '')
const TIMEOUT_MS = Number(process.env.CRON_TIMEOUT_MS ?? 600_000)
// One retry covers a transient blip; a persistent failure is better left to the
// next scheduled run than hammered here.
const ATTEMPTS = 2
const RETRY_DELAY_MS = 5_000

function log(...args) {
  console.log(`[cron ${new Date().toISOString()}]`, ...args)
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** One attempt. Returns { ok, detail }; never throws. */
async function callJob(job) {
  const url = `${BASE_URL}/api/cron/${job}`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  const startedAt = Date.now()
  try {
    const res = await fetch(url, {
      headers: { authorization: `Bearer ${SECRET}` },
      signal: controller.signal,
    })
    const body = await res.text()
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)

    // Most routes signal failure with the status code; a couple also carry
    // `ok: false` in a 200 body, so check both.
    let okFlag = true
    try { const parsed = JSON.parse(body); if (parsed && parsed.ok === false) okFlag = false } catch { /* not JSON */ }

    if (!res.ok || !okFlag) {
      return { ok: false, detail: `HTTP ${res.status} after ${seconds}s — ${body.slice(0, 500)}` }
    }
    return { ok: true, detail: `HTTP ${res.status} in ${seconds}s — ${body.slice(0, 300)}` }
  } catch (err) {
    const seconds = ((Date.now() - startedAt) / 1000).toFixed(1)
    const reason = err?.name === 'AbortError' ? `timed out after ${seconds}s` : String(err)
    return { ok: false, detail: reason }
  } finally {
    clearTimeout(timer)
  }
}

async function runJob(job) {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const result = await callJob(job)
    if (result.ok) {
      log(`✓ ${job}: ${result.detail}`)
      return true
    }
    if (attempt < ATTEMPTS) {
      log(`↻ ${job} failed (attempt ${attempt}/${ATTEMPTS}): ${result.detail}`)
      await sleep(RETRY_DELAY_MS)
    } else {
      log(`✗ ${job}: ${result.detail}`)
    }
  }
  return false
}

async function main() {
  const requested = process.argv.slice(2)

  if (requested.length === 0) {
    log(`No jobs given. Usage: node scripts/run-cron.mjs <${JOBS.join('|')}> [...]`)
    process.exit(2)
  }
  const unknown = requested.filter((j) => !JOBS.includes(j))
  if (unknown.length > 0) {
    // Fail loudly: a typo would otherwise just 404 every run, forever.
    log(`Unknown job(s): ${unknown.join(', ')}. Known jobs: ${JOBS.join(', ')}`)
    process.exit(2)
  }
  if (!SECRET) {
    log('CRON_SECRET is not set — the endpoints would reject every call. Set it on this service.')
    process.exit(2)
  }

  log(`Running ${requested.length} job(s) against ${BASE_URL}: ${requested.join(', ')}`)

  // Sequential on purpose: these share a database, and one job at a time keeps
  // the logs readable and the load predictable.
  const failed = []
  for (const job of requested) {
    const ok = await runJob(job)
    if (!ok) failed.push(job)
  }

  if (failed.length > 0) {
    log(`FAILED: ${failed.join(', ')}`)
    process.exit(1)
  }
  log('All jobs completed.')
}

main().catch((err) => {
  log('Runner crashed:', err)
  process.exit(1)
})
