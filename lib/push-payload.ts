/**
 * Pure helpers for Web Push — what goes in a push message and when a
 * subscription is dead. Kept free of web-push/Supabase so they unit-test.
 */

export interface NotificationRow {
  id: string
  organization_id: string
  user_id: string
  type: string | null
  title: string
  body: string | null
  data: unknown
}

export interface PushPayload {
  title: string
  body: string
  /** Where a tap lands. Relative path or absolute https URL. */
  href: string
  /** Collapses duplicate deliveries of the same notification. */
  tag: string
  /** Unread count for the home-screen badge; omitted when unknown. */
  badge?: number
  type: string | null
}

const TITLE_MAX = 100
const BODY_MAX = 200

/**
 * The deep link a notification carries. The bell already honours data.href
 * (generic), accept_url (team invites) and team_url (captain assignment);
 * push taps follow the same fields. Anything else lands on the dashboard,
 * where the bell shows the notification itself.
 */
export function notificationHref(data: unknown): string {
  if (data && typeof data === 'object') {
    const d = data as Record<string, unknown>
    for (const key of ['href', 'accept_url', 'team_url']) {
      const v = d[key]
      if (typeof v === 'string' && (v.startsWith('/') || v.startsWith('https://'))) return v
    }
  }
  return '/dashboard'
}

export function buildPushPayload(row: NotificationRow, unread?: number): PushPayload {
  return {
    title: row.title.slice(0, TITLE_MAX),
    body: (row.body ?? '').slice(0, BODY_MAX),
    href: notificationHref(row.data),
    tag: row.id,
    ...(typeof unread === 'number' ? { badge: unread } : {}),
    type: row.type,
  }
}

/** 404/410 from the push service mean the browser unsubscribed — delete the row. */
export function shouldDropSubscription(statusCode: number | undefined): boolean {
  return statusCode === 404 || statusCode === 410
}
