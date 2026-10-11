import { doorJson, withDisplay } from '@/lib/door/http'
import { displayState } from '@/lib/door/service'

/**
 * What a display renders from. Broadcasts are only hints: displays call this on
 * every hint, on reconnect / tab focus, and every 15 s, so a missed message
 * self-heals. `?screen=1` marks this display as an armed screen right now.
 */
export async function GET(request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  const screen = new URL(request.url).searchParams.get('screen') === '1'
  return withDisplay(displayToken, async ({ display, station }) => doorJson(await displayState(display, station, { screen })))
}
