import { describe, expect, it } from 'vitest'
import {
  assignCaptain,
  buildCommandOrder,
  clearViceCaptain,
  getCaptainAgent,
  getViceCaptainAgent,
  toggleViceCaptain,
  type RankedAgentLike,
} from '../command-hierarchy'

const seedTeam = (): RankedAgentLike[] => [
  { id: 'pm', name: 'PM Orchestrator', roleId: 'pm' },
  { id: 'arch', name: 'System Architect', roleId: 'arch' },
  { id: 'fe', name: 'Frontend Engineer', roleId: 'fe' },
  { id: 'be', name: 'Backend Engineer', roleId: 'be' },
]

describe('Team Captain & Optional Vice Captain Hierarchy', () => {
  it('defaults to 1 Captain with NO Vice Captain required', () => {
    const team = seedTeam()
    expect(getCaptainAgent(team)?.id).toBe('pm')
    expect(getViceCaptainAgent(team)).toBeNull()
    expect(buildCommandOrder(team)).toEqual(['pm', 'arch', 'fe', 'be'])
  })

  it('allows assigning any agent as the sole Captain and keeps at most 1 Captain', () => {
    let team = assignCaptain(seedTeam(), 'arch')
    expect(getCaptainAgent(team)?.id).toBe('arch')
    expect(team.filter((a) => a.commandRank === 'captain')).toHaveLength(1)
    expect(getViceCaptainAgent(team)).toBeNull()

    team = assignCaptain(team, 'fe')
    expect(getCaptainAgent(team)?.id).toBe('fe')
    expect(team.find((a) => a.id === 'arch')?.commandRank).toBe('member')
  })

  it('supports toggling optional Vice Captain on/off and clearing back to solo Captain', () => {
    let team = assignCaptain(seedTeam(), 'pm')
    team = toggleViceCaptain(team, 'arch')
    expect(getCaptainAgent(team)?.id).toBe('pm')
    expect(getViceCaptainAgent(team)?.id).toBe('arch')
    expect(buildCommandOrder(team)).toEqual(['pm', 'arch', 'fe', 'be'])

    // Switching Vice Captain moves slot cleanly
    team = toggleViceCaptain(team, 'be')
    expect(getViceCaptainAgent(team)?.id).toBe('be')
    expect(team.filter((a) => a.commandRank === 'vice')).toHaveLength(1)
    expect(buildCommandOrder(team)).toEqual(['pm', 'be', 'arch', 'fe'])

    // Clicking Vice Captain again removes Vice Captain (Captain-only mode)
    team = toggleViceCaptain(team, 'be')
    expect(getViceCaptainAgent(team)).toBeNull()
    expect(getCaptainAgent(team)?.id).toBe('pm')

    // Re-assigning vice and promoting vice to captain clears vice slot automatically
    team = toggleViceCaptain(team, 'arch')
    team = assignCaptain(team, 'arch')
    expect(getCaptainAgent(team)?.id).toBe('arch')
    expect(getViceCaptainAgent(team)).toBeNull()

    // clearViceCaptain removes vice cleanly
    team = toggleViceCaptain(team, 'fe')
    expect(getViceCaptainAgent(team)?.id).toBe('fe')
    team = clearViceCaptain(team)
    expect(getViceCaptainAgent(team)).toBeNull()
  })
})
