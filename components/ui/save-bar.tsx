'use client'

/**
 * The save bar for long admin forms: sticks to the bottom of the admin
 * scroller, says whether there's anything to save, and shows a save error
 * right above the button (at the top of a long form it was off-screen).
 *
 * Put it as the last child of the <form>. Pair with `useUnsavedChanges(dirty)`
 * and set `dirty` from user input bubbling to the form (onInput / onChange,
 * plus clicks on `button[type=button]:not([data-no-dirty])` for toggles).
 */
export function SaveBar({
  dirty,
  saving,
  error,
  label = 'Save changes',
  savingLabel = 'Saving…',
  idleNote = 'No changes yet',
  disabled = false,
}: {
  dirty: boolean
  saving: boolean
  error?: string | null
  label?: string
  savingLabel?: string
  idleNote?: string
  disabled?: boolean
}) {
  return (
    <div className="sticky bottom-0 z-10 -mx-4 lg:mx-0 px-4 lg:px-5 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] bg-white/95 backdrop-blur border-t lg:border lg:rounded-lg space-y-2">
      {error && (
        <p role="alert" className="fd-fade-in bg-red-50 border border-red-200 text-red-700 px-3 py-2 rounded text-sm">{error}</p>
      )}
      <div className="flex items-center gap-3">
        <p className="flex-1 min-w-0 text-xs text-gray-500" aria-live="polite">
          {dirty ? <span key="dirty" className="fd-fade-in font-medium text-amber-700">Unsaved changes</span> : idleNote}
        </p>
        <button
          type="submit"
          data-no-dirty
          disabled={saving || disabled}
          className="press min-h-10 px-5 rounded-md text-sm font-semibold bg-brand-primary text-on-brand disabled:opacity-60"
        >
          {saving ? savingLabel : label}
        </button>
      </div>
    </div>
  )
}
