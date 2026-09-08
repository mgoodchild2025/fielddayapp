import { NextResponse } from 'next/server'

/**
 * Web Share Target endpoint (see /api/manifest → share_target). In normal
 * operation the root service worker intercepts this POST and parks the shared
 * files client-side before the request ever reaches the server. This handler
 * only runs when the worker isn't controlling yet (very first launch after
 * install) — we can't keep the files, so send the player to /share with a hint.
 */
export async function POST(request: Request) {
  return NextResponse.redirect(new URL('/share?fallback=1', request.url), 303)
}
