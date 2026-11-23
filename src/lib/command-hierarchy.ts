export type CommandRank = 'captain' | 'vice' | 'member'

export type RankedAgentLike = {
  id: string
  name: string
  roleId?: string
  commandRank?: CommandRank
}

/**
 * Resolves the single active Team Captain (Đội trưởng).
 * Guarantees a team with at least 1 agent always has an identifiable captain.
 */
export function getCaptainAgent<T extends RankedAgentLike>(agents: T[]): T | null {
  if (!agents.length) return null
  return (
    agents.find((a) => a.commandRank === 'captain') ??
    agents.find((a) => a.roleId === 'pm' || a.id === 'pm') ??
    agents[0]
  )
}

/**
 * Resolves the optional Vice Captain (Đội phó).
 * Returns `null` when the team runs with only 1 Captain and no Vice Captain.
 */
export function getViceCaptainAgent<T extends RankedAgentLike>(agents: T[]): T | null {
  if (agents.length < 2) return null
  const captain = getCaptainAgent(agents)
  return agents.find((a) => a.commandRank === 'vice' && a.id !== captain?.id) ?? null
}

/**
 * Assigns `targetId` as the sole Team Captain (Đội trưởng).
 * Demotes any previous captain to 'member'. Preserves any existing vice captain
 * unless `targetId` was previously the vice captain (in which case vice becomes unset).
 */
export function assignCaptain<T extends RankedAgentLike>(agents: T[], targetId: string): T[] {
  if (!agents.some((a) => a.id === targetId)) return agents
  return agents.map((a) => {
    if (a.id === targetId) return { ...a, commandRank: 'captain' as const }
    if (a.commandRank === 'captain') return { ...a, commandRank: 'member' as const }
    return a
  })
}

/**
 * Toggles `targetId` as the optional Vice Captain (Đội phó).
 * - If `targetId` is already the Captain, returns unchanged (Captain cannot be demoted by vice button).
 * - If `targetId` is already the Vice Captain, removes Vice Captain (team runs with Captain only).
 * - Otherwise promotes `targetId` to Vice Captain and demotes any previous Vice Captain to 'member'.
 */
export function toggleViceCaptain<T extends RankedAgentLike>(agents: T[], targetId: string): T[] {
  const captain = getCaptainAgent(agents)
  if (!captain || captain.id === targetId) return agents
  const target = agents.find((a) => a.id === targetId)
  if (!target) return agents

  const removing = target.commandRank === 'vice'
  return agents.map((a) => {
    if (a.id === captain.id) return { ...a, commandRank: 'captain' as const }
    if (a.id === targetId) {
      return { ...a, commandRank: removing ? ('member' as const) : ('vice' as const) }
    }
    if (a.commandRank === 'vice') return { ...a, commandRank: 'member' as const }
    return a
  })
}

/**
 * Clears the Vice Captain slot so the team runs with 1 Captain only.
 */
export function clearViceCaptain<T extends RankedAgentLike>(agents: T[]): T[] {
  return agents.map((a) =>
    a.commandRank === 'vice' ? { ...a, commandRank: 'member' as const } : a,
  )
}

/**
 * Returns agent IDs ordered with Captain first, optional Vice Captain second, then all other members.
 */
export function buildCommandOrder<T extends RankedAgentLike>(agents: T[]): string[] {
  const captain = getCaptainAgent(agents)
  const vice = getViceCaptainAgent(agents)
  const rest = agents.filter((a) => a.id !== captain?.id && a.id !== vice?.id)
  return [
    ...(captain ? [captain.id] : []),
    ...(vice ? [vice.id] : []),
    ...rest.map((a) => a.id),
  ]
}
