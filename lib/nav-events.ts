'use client'

/**
 * The phone tab bar's Menu and Alerts buttons open UI that lives elsewhere —
 * the site drawer (MobileNav, inside OrgNav), the admin drawer (AdminSidebar)
 * and the notification bell — by event, so the bar needs none of their data.
 * The bell publishes its unread count here for the bar's badge.
 */

export const OPEN_SITE_MENU = 'fd:open-site-menu'
export const OPEN_ADMIN_MENU = 'fd:open-admin-menu'
export const OPEN_ALERTS = 'fd:open-alerts'

export function openFromTabBar(event: typeof OPEN_SITE_MENU | typeof OPEN_ADMIN_MENU | typeof OPEN_ALERTS) {
  window.dispatchEvent(new Event(event))
}

let unread = 0
const listeners = new Set<() => void>()

export const unreadStore = {
  get: () => unread,
  set(count: number) {
    if (count === unread) return
    unread = count
    listeners.forEach((l) => l())
  },
  subscribe(listener: () => void) {
    listeners.add(listener)
    return () => { listeners.delete(listener) }
  },
}
