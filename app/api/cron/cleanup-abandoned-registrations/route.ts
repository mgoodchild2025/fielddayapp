/**
 * Cleanup Abandoned Registrations Cron
 *
 * Removes registration rows left behind by checkouts that were never
 * completed — a player reaches the payment step, backs out, and the 'pending'
 * row stays forever. They count for nothing (occupancy and "joined" status are
 * both active-only), but they clutter admin registration lists and confuse
 * anyone reading the table directly.
 *
 * Safety rules — a row is only removed when ALL hold:
 *   1. status = 'pending' — offline-payment registrations are created ACTIVE
 *      with a pending PAYMENT row, so 'pending' here means one thing only:
 *      an online checkout that never finished.
 *   2. Older than the grace window (default 48h) — long past any live
 *      checkout, any retry, and any same-day resume of a season registration.
 *   3. No payments rows at all. Anything with a payment record — even failed
 *      or pending — is left for human eyes, and payments.registration_id has
 *      no ON DELETE clause, so deleting one would fail anyway.
 *
 * Schedule: daily (e.g. 5 AM UTC on cron-job.org)
 * Preview without deleting: ?dryRun=1 · Custom window: ?hours=72
 */

import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

function authorized(req: NextRequest) {
  const secret = process.env.CRON_SECRET
  if (!secret) return true
  return req.headers.get('authorization') === `Bearer ${secret}`
}

const DEFAULT_HOURS = 48

export async function GET(req: NextRequest) {
  if (!authorized(req)) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { searchParams } = new URL(req.url)
  const dryRun = searchParams.get('dryRun') === '1'
  const hours = Math.min(24 * 30, Math.max(1, parseInt(searchParams.get('hours') ?? '') || DEFAULT_HOURS))
  const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString()

  const db = createServiceRoleClient()

  try {
    const { data: candidates, error: findErr } = await db
      .from('registrations')
      .select('id, league_id, organization_id, created_at, registration_type')
      .eq('status', 'pending')
      .lt('created_at', cutoff)
      .limit(1000)

    if (findErr) {
      return NextResponse.json({ error: findErr.message }, { status: 500 })
    }

    const ids = (candidates ?? []).map((r) => r.id)
    if (ids.length === 0) {
      return NextResponse.json({ ok: true, dryRun, hours, examined: 0, deleted: 0, skippedWithPayments: 0 })
    }

    // Anything with a payment record is left alone — see rule 3.
    const { data: paidRows, error: payErr } = await db
      .from('payments')
      .select('registration_id')
      .in('registration_id', ids)
    if (payErr) {
      return NextResponse.json({ error: payErr.message }, { status: 500 })
    }
    const hasPayment = new Set((paidRows ?? []).map((p) => p.registration_id as string))
    const deletable = ids.filter((id) => !hasPayment.has(id))

    if (dryRun) {
      return NextResponse.json({
        ok: true,
        dryRun: true,
        hours,
        examined: ids.length,
        wouldDelete: deletable.length,
        skippedWithPayments: ids.length - deletable.length,
        sample: (candidates ?? [])
          .filter((r) => deletable.includes(r.id))
          .slice(0, 10)
          .map((r) => ({ id: r.id, type: r.registration_type, created_at: r.created_at })),
      })
    }

    let deleted = 0
    if (deletable.length > 0) {
      const { error: delErr, count } = await db
        .from('registrations')
        .delete({ count: 'exact' })
        .in('id', deletable)
      if (delErr) {
        return NextResponse.json({ error: delErr.message }, { status: 500 })
      }
      deleted = count ?? deletable.length
    }

    return NextResponse.json({
      ok: true,
      dryRun: false,
      hours,
      examined: ids.length,
      deleted,
      skippedWithPayments: ids.length - deletable.length,
    })
  } catch (err) {
    console.error('[cleanup-abandoned-registrations]', err)
    return NextResponse.json({ error: String(err) }, { status: 500 })
  }
}
