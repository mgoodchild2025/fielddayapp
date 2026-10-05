import { describe, it, expect } from 'vitest'
import { isStaleBuildError, isNetworkError, actionErrorMessage, NETWORK_ERROR_MESSAGE, STALE_PAGE_MESSAGE } from './action-errors'

describe('action error classification', () => {
  it('recognises a stale server action after a deploy', () => {
    const e = new Error('Server Action "7f3a…" was not found on the server. Read more: https://nextjs.org/docs/messages/failed-to-find-server-action')
    expect(isStaleBuildError(e)).toBe(true)
    expect(actionErrorMessage(e)).toBe(STALE_PAGE_MESSAGE)
  })
  it('recognises transport failures across browsers', () => {
    for (const m of ['Failed to fetch', 'Load failed', 'NetworkError when attempting to fetch resource.', 'The network connection was lost.', 'An unexpected response was received from the server.']) {
      expect(isNetworkError(new TypeError(m))).toBe(true)
      expect(actionErrorMessage(new TypeError(m))).toBe(NETWORK_ERROR_MESSAGE)
    }
  })
  it('does not call an ordinary error a network error', () => {
    const e = new Error('Cannot read properties of undefined')
    expect(isNetworkError(e)).toBe(false)
    expect(isStaleBuildError(e)).toBe(false)
    expect(actionErrorMessage(e)).toMatch(/Something went wrong/)
  })
})
