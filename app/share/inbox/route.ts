import { NextResponse } from 'next/server'
import { publicOrigin } from '@/lib/public-origin'

/**
 * Web Share Target endpoint (see /api/manifest → share_target). In normal
 * operation the root service worker intercepts this POST and parks the shared
 * files client-side before the request ever reaches the server. This handler
 * only runs when the worker isn't controlling yet (very first launch after
 * install) — we can't keep the files, so send the player to /share with a hint.
 *
 * The redirect is built from the public host, not request.url: behind
 * Railway's proxy request.url is the container address (0.0.0.0:8080).
 */
export async function POST(request: Request) {
  return NextResponse.redirect(`${publicOrigin(request)}/share?fallback=1`, 303)
}
