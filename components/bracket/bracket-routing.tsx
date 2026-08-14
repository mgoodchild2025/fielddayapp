'use client'

import { createContext, useContext } from 'react'

/**
 * A match an admin can route a winner/loser into. Targets are collected across
 * every tier/bracket in the playoff config, so a match in one bracket can drop
 * a loser into a match in another (e.g. Gold quarterfinal → Silver first round).
 */
export interface RoutingTarget {
  /** bracket_matches.id */
  id: string
  /** Which bracket this match belongs to — used to group the picker options. */
  bracketId: string
  /** Tier / bracket display name, e.g. "Gold". */
  bracketName: string
  /** Human label for the match, e.g. "Semi-Finals · Match 1". */
  label: string
}

const BracketRoutingContext = createContext<RoutingTarget[]>([])

export function BracketRoutingProvider({
  targets,
  children,
}: {
  targets: RoutingTarget[]
  children: React.ReactNode
}) {
  return (
    <BracketRoutingContext.Provider value={targets}>
      {children}
    </BracketRoutingContext.Provider>
  )
}

/** All routing targets across the config's brackets. Empty outside a provider. */
export function useRoutingTargets(): RoutingTarget[] {
  return useContext(BracketRoutingContext)
}
