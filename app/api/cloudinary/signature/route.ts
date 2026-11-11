import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { signUploadParams, isCloudinaryConfigured } from '@/lib/cloudinary'
import { vetParamsToSign } from '@/lib/cloudinary-scope'

/**
 * Signs Cloudinary upload params for the browser widget. Auth-gated: only a
 * logged-in member of the current org can obtain a signature, and only for
 * an upload into one of this org's event folders. The CldUploadWidget POSTs
 * { paramsToSign } here and expects { signature } back.
 */
export async function POST(request: NextRequest) {
  if (!isCloudinaryConfigured()) {
    return NextResponse.json({ error: 'Uploads are not configured.' }, { status: 503 })
  }

  const headersList = await headers()
  const org = await getCurrentOrg(headersList)

  const supabase = await createServerClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Sign in to upload.' }, { status: 401 })

  // Must be an active member of this org (any role — players included).
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('user_id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .eq('status', 'active')
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not a member of this organization.' }, { status: 403 })

  // Sign only what the widget sends, and only for an event folder of this org
  // (lib/cloudinary-scope.ts). Whatever arrived used to be signed as-is, which
  // let a member write anywhere in the Cloudinary account.
  const body = await request.json().catch(() => null)
  const vetted = vetParamsToSign(body?.paramsToSign, org.id, Math.floor(Date.now() / 1000))
  if (!vetted.ok) {
    console.warn(`[cloudinary/signature] refused for org ${org.id}: ${vetted.error}`)
    return NextResponse.json({ error: vetted.error }, { status: 400 })
  }
  const { data: league } = await db
    .from('leagues').select('id').eq('id', vetted.leagueId).eq('organization_id', org.id).maybeSingle()
  if (!league) return NextResponse.json({ error: 'Event not found.' }, { status: 404 })

  const signature = signUploadParams(vetted.params)
  return NextResponse.json({ signature })
}
