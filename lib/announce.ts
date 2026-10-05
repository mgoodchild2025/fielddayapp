/**
 * Say something to screen readers without moving focus — for inline notes
 * that appear beside their control ("Copied!", "Saved"). A label swapping on
 * a focused button isn't re-read by VoiceOver, and a freshly inserted note
 * isn't announced at all. Writes into the one polite live region in
 * app/layout.tsx (#fd-announcer).
 */
export function announce(message: string) {
  if (typeof document === 'undefined') return
  const el = document.getElementById('fd-announcer')
  if (!el) return
  // Clear first so the same message twice in a row is still read.
  el.textContent = ''
  window.setTimeout(() => { el.textContent = message }, 50)
}
