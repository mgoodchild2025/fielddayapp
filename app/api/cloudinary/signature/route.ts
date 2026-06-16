import { NextRequest, NextResponse } from 'next/server'
import { headers } from 'next/headers'
import { getCurrentOrg } from '@/lib/tenant'
import { createServerClient } from '@/lib/supabase/server'
import { createServiceRoleClient } from '@/lib/supabase/service'
import { signUploadParams, isCloudinaryConfigured } from '@/lib/cloudinary'

/**
 * Signs Cloudinary upload params for the browser widget. Auth-gated: only a
 * logged-in member of the current org can obtain a signature, so random
 * visitors can't upload to the account. The CldUploadWidget POSTs
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

  // Must be a member of this org (any role — players included).
  const db = createServiceRoleClient()
  const { data: member } = await db
    .from('org_members')
    .select('user_id')
    .eq('organization_id', org.id)
    .eq('user_id', user.id)
    .maybeSingle()
  if (!member) return NextResponse.json({ error: 'Not a member of this organization.' }, { status: 403 })

  const body = await request.json().catch(() => null)
  const paramsToSign = body?.paramsToSign
  if (!paramsToSign || typeof paramsToSign !== 'object') {
    return NextResponse.json({ error: 'Missing paramsToSign.' }, { status: 400 })
  }

  const signature = signUploadParams(paramsToSign as Record<string, string | number>)
  return NextResponse.json({ signature })
}
