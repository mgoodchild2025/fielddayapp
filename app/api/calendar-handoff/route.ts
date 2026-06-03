import { NextRequest, NextResponse } from 'next/server'

/**
 * Bridges an https email link to a `webcal://` calendar subscription.
 *
 * Email clients (notably Gmail) strip non-http(s) hrefs, turning `webcal://`
 * links into "#". So the "Add to Apple Calendar" button in our emails points
 * here over https; this endpoint hands off to the webcal:// scheme at click
 * time using the *real* request host (also fixing any stale build-time host).
 *
 * Usage: /api/calendar-handoff?p=%2Fapi%2Fevents%2F<slug>%2Fcalendar.ics%3Ftoken%3D<token>
 */
export async function GET(request: NextRequest) {
  const p = request.nextUrl.searchParams.get('p')

  // Only allow our own relative calendar-feed paths — never an arbitrary URL.
  if (!p || !p.startsWith('/api/') || !p.includes('calendar.ics')) {
    return new NextResponse('Invalid calendar link', { status: 400 })
  }

  const host = request.headers.get('host') ?? request.nextUrl.host
  const httpsProtocol = host.startsWith('localhost') || host.startsWith('127.') ? 'http' : 'https'
  const webcalUrl = `webcal://${host}${p}`
  const httpsUrl = `${httpsProtocol}://${host}${p}`

  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/"/g, '&quot;')

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <meta http-equiv="refresh" content="0;url=${esc(webcalUrl)}">
  <title>Add to Apple Calendar</title>
</head>
<body style="font-family:-apple-system,system-ui,sans-serif;text-align:center;padding:48px 24px;color:#111">
  <h1 style="font-size:20px;margin-bottom:8px">Opening Calendar&hellip;</h1>
  <p style="color:#666;font-size:14px;margin-bottom:24px">Your calendar app should open and offer to subscribe.</p>
  <p>
    <a href="${esc(webcalUrl)}" style="display:inline-block;background:#111;color:#fff;text-decoration:none;padding:12px 24px;border-radius:8px;font-weight:600">
      Add to Calendar
    </a>
  </p>
  <p style="margin-top:20px;color:#999;font-size:13px">
    Didn&rsquo;t work? <a href="${esc(httpsUrl)}" style="color:#999">Download the calendar file</a> instead.
  </p>
  <script>setTimeout(function(){ location.href = ${JSON.stringify(webcalUrl)} }, 50)</script>
</body>
</html>`

  return new NextResponse(html, {
    status: 200,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}
