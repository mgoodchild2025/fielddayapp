import { cache } from 'react'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import { AuthError, type User } from '@supabase/supabase-js'
import type { Database } from '@/types/database'
import { owesSecondFactor, verifiedFactors } from '@/lib/mfa-gate'

type AnyClient = { auth: { getUser: (jwt?: string) => Promise<{ data: { user: User | null }; error: unknown }> } }
const beforeMfa = new WeakMap<object, () => Promise<{ data: { user: User | null }; error: unknown }>>()

const mfaRequired = () => new AuthError('Two-step verification required', 403, 'mfa_required')

/**
 * The signed-in user even when the session still owes a two-factor code.
 * For the sign-in flow ONLY — where to send someone after their password, the
 * /mfa/verify page, the backup-code action. Never use it to authorise anything:
 * everything else calls `auth.getUser()`, which answers "nobody" until the code
 * is entered.
 */
export async function getUserBeforeMfa(client: AnyClient): Promise<User | null> {
  const real = beforeMfa.get(client)
  const { data } = await (real ? real() : client.auth.getUser())
  return data.user
}

async function buildServerClient() {
  const cookieStore = await cookies()

  const client = createSupabaseServerClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => {
              cookieStore.set(name, value, options)
            })
          } catch {
            // Called from a Server Component — cookies are read-only; middleware handles refresh
          }
        },
      },
    }
  )

  // auth.getUser() is a network round trip to Supabase Auth, and a typical
  // page asked it 5–7 times (org layout, segment layout, page, OrgNav, tab
  // bar, helpers). Memoise it per client; a sign-in / sign-out / user update
  // on this client clears the memo so the next call sees the new user.
  const getUser = client.auth.getUser.bind(client.auth)
  type UserResult = Awaited<ReturnType<typeof getUser>>
  let pending: Promise<UserResult> | null = null
  let gated: Promise<UserResult> | null = null
  let listening = false
  const clear = () => { pending = null; gated = null }
  const real = () => {
    pending ??= getUser().then((res) => {
      if (res.error) clear() // don't pin a transient failure
      // Listen only once the client has initialised (getUser waits for it):
      // initialisation itself can emit SIGNED_IN for the existing session,
      // which would otherwise wipe the memo and cost a second round trip.
      if (!listening) {
        listening = true
        client.auth.onAuthStateChange((event) => {
          // INITIAL_SESSION / TOKEN_REFRESHED don't change who the user is.
          if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED' || event === 'MFA_CHALLENGE_VERIFIED') clear()
        })
      }
      return res
    })
    return pending
  }

  // Two-factor gate (lib/mfa-gate.ts): to everything on the server, a session
  // that still owes a code has NO user. Half the app's permission checks are
  // written inline around getUser() rather than through lib/auth.ts, and
  // server actions skip layouts, so this is the one place that covers them
  // all. Only the sign-in flow itself asks who is waiting (getUserBeforeMfa).
  client.auth.getUser = ((jwt?: string) => {
    if (jwt) return getUser(jwt)
    gated ??= real().then(async (res) => {
      if (verifiedFactors(res.data.user).length === 0) return res
      const { data: { session } } = await client.auth.getSession()
      if (!owesSecondFactor(res.data.user, session?.access_token)) return res
      return { data: { user: null }, error: mfaRequired() } as UserResult
    })
    return gated
  }) as typeof client.auth.getUser
  beforeMfa.set(client, real)

  return client
}

/**
 * The cookie-based Supabase client. During a server render it's one shared
 * instance per request (React `cache`), so every layout, nav and page that
 * calls `auth.getUser()` shares a single Auth round trip. Outside rendering
 * (server actions, route handlers) `cache` doesn't memoise — each call gets a
 * fresh client, exactly as before.
 */
export const createServerClient = cache(buildServerClient)
