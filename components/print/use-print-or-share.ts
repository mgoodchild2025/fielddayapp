'use client'

import { useState, useSyncExternalStore } from 'react'
import { toast } from 'sonner'
import { isIosStandalone, makePdf, sharePdf } from '@/lib/print-or-share'

const noSubscribe = () => () => {}

/**
 * Every print button's behaviour: the print dialog normally; in an iPhone
 * home-screen app (where window.print() does nothing) a PDF handed to the
 * share sheet — Print, Save to Files, Mail. iOS opens the share sheet only
 * straight after a tap, so if building the PDF outlasted it, the button turns
 * into "Share PDF" for one more tap.
 */
export function usePrintOrShare(label = '🖨 Print / Save as PDF') {
  const iosApp = useSyncExternalStore(noSubscribe, isIosStandalone, () => false)
  const [busy, setBusy] = useState(false)
  const [ready, setReady] = useState<File | null>(null)

  async function share(file: File) {
    const outcome = await sharePdf(file, document.title)
    if (outcome === 'needs-tap') { setReady(file); return }
    setReady(null)
    if (outcome === 'downloaded') toast.success('PDF saved')
  }

  async function print() {
    if (!iosApp) { window.print(); return }
    if (busy) return
    if (ready) { await share(ready).catch(() => toast.error("Couldn't open the share sheet.")); return }
    setBusy(true)
    try {
      await share(await makePdf(document.title))
    } catch {
      toast.error("Couldn't make the PDF. Try again, or print from a computer.")
    } finally {
      setBusy(false)
    }
  }

  // A page opened in a new tab closes; one opened in place (the home-screen
  // app, where window.close() does nothing) goes back.
  function back() {
    if (window.history.length > 1) window.history.back()
    else window.close()
  }

  return {
    print,
    back,
    busy,
    iosApp,
    label: busy ? 'Making PDF…' : ready ? '📄 Share PDF' : label,
    backLabel: iosApp ? '← Back' : '← Close',
  }
}
