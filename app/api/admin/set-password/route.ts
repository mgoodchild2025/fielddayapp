import { NextRequest, NextResponse } from 'next/server'
import { createServiceRoleClient } from '@/lib/supabase/service'

// Temporary one-shot endpoint to reset an account password without email.
// Secured by CRON_SECRET. Delete this file once the accounts are recovered.
export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-admin-secret')
  if (!secret || secret !== process.env.CRON_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { email, password } = await req.json()
  if (!email || !password || password.length < 8) {
    return NextResponse.json({ error: 'email and password (min 8 chars) required' }, { status: 400 })
  }

  const db = createServiceRoleClient()
  const { data: { users }, error: listError } = await db.auth.admin.listUsers({ perPage: 1000 })
  if (listError) return NextResponse.json({ error: listError.message }, { status: 500 })

  const user = users.find((u) => u.email === email)
  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  const { error } = await db.auth.admin.updateUserById(user.id, { password })
  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  return NextResponse.json({ ok: true, userId: user.id })
}
