'use client'

import { createContext, useContext } from 'react'

/**
 * Org (venue) timezone for the bracket UI. Provided by BracketView and consumed
 * by the match cards, score list, and edit modal so all bracket times render
 * and save in the venue timezone rather than the viewer's browser timezone.
 */
export const BracketTimezoneContext = createContext<string>('America/Toronto')

export const useBracketTimezone = () => useContext(BracketTimezoneContext)
