import { cache } from 'react'
import { createServerClient as createSupabaseServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'
import type { Database } from '@/types/database'

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
  let pending: ReturnType<typeof getUser> | null = null
  let listening = false
  client.auth.getUser = ((jwt?: string) => {
    if (jwt) return getUser(jwt)
    pending ??= getUser().then((res) => {
      if (res.error) pending = null // don't pin a transient failure
      // Listen only once the client has initialised (getUser waits for it):
      // initialisation itself can emit SIGNED_IN for the existing session,
      // which would otherwise wipe the memo and cost a second round trip.
      if (!listening) {
        listening = true
        client.auth.onAuthStateChange((event) => {
          // INITIAL_SESSION / TOKEN_REFRESHED don't change who the user is.
          if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') pending = null
        })
      }
      return res
    })
    return pending
  }) as typeof client.auth.getUser

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
