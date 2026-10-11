import { doorJson, withDisplay } from '@/lib/door/http'
import { requestOrigin } from '@/lib/door/service'
import { formatJoinCode } from '@/lib/door/tokens'

/** ADD A DEVICE: the staff join QR target and typed code, for a teammate across the room. */
export async function GET(request: Request, { params }: { params: Promise<{ displayToken: string }> }) {
  const { displayToken } = await params
  return withDisplay(displayToken, async ({ station }) => {
    const origin = requestOrigin(request)
    return doorJson({
      joinUrl: `${origin}/door/join/${station.join_token}`,
      joinCode: formatJoinCode(station.join_code),
      typeUrl: `${origin}/door/join`,
    })
  })
}
