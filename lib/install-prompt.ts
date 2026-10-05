/**
 * Chrome/Android fire `beforeinstallprompt` ONCE, early in the page's life.
 * The dashboard's AlertsNudge only listened while it was mounted, so after a
 * client-side navigation to /dashboard the event was already gone and Android
 * got "Show me how" instead of the real install dialog. Captured app-wide
 * here (imported by PwaRegistrar in the org layout) and read on demand.
 */
export interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>
}

let captured: BeforeInstallPromptEvent | null = null
const listeners = new Set<(e: BeforeInstallPromptEvent | null) => void>()

if (typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault()
    captured = e as BeforeInstallPromptEvent
    listeners.forEach((l) => l(captured))
  })
  window.addEventListener('appinstalled', () => {
    captured = null
    listeners.forEach((l) => l(null))
  })
}

export function getInstallPrompt(): BeforeInstallPromptEvent | null {
  return captured
}

export function onInstallPrompt(listener: (e: BeforeInstallPromptEvent | null) => void): () => void {
  listeners.add(listener)
  return () => { listeners.delete(listener) }
}
