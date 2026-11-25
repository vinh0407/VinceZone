import type { Agent, ProjectSessionData } from '@/components/ide/agent-types'
import { createSeedAgents, defaultMemoryNotes, uid } from '@/components/ide/workspace-defaults'
import { getCaptainAgent } from '@/lib/command-hierarchy'

export function normalizeRootKey(root?: string): string {
  if (!root) return ''
  return root.trim().replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase()
}

export function makeDiskProjectId(root: string): string {
  return `disk-${normalizeRootKey(root)}`
}

export function cloneProjectSession(session: ProjectSessionData): ProjectSessionData {
  return {
    agents: session.agents.map((a) => ({
      ...a,
      messages: a.messages.map((m) => ({
        ...m,
        images: m.images ? m.images.map((img) => ({ ...img })) : undefined,
      })),
    })),
    agentTasks: session.agentTasks.map((t) => ({ ...t })),
    communicationEvents: session.communicationEvents.map((e) => ({ ...e })),
    proposedPatches: session.proposedPatches.map((p) => ({ ...p })),
    revisions: session.revisions.map((r) => ({ ...r })),
    memoryNotes: session.memoryNotes.map((n) => ({ ...n })),
    chatThreads: (session.chatThreads ?? []).map((t) => ({
      ...t,
      agents: t.agents.map((a) => ({
        ...a,
        messages: a.messages.map((m) => ({ ...m })),
      })),
    })),
  }
}

export function findPmAgentId(list: Agent[]): string {
  return (
    getCaptainAgent(list)?.id ??
    list.find((item) => item.roleId === 'pm' || item.id === 'pm')?.id ??
    list[0]?.id ??
    'pm'
  )
}

export function createFreshSession(projectName: string): ProjectSessionData {
  const seeded = createSeedAgents().map((agent, index) =>
    index === 0
      ? {
          ...agent,
          messages: [
            {
              id: uid(),
              role: 'assistant' as const,
              text: `[${projectName}] PM Orchestrator ready. This project has its own isolated agent chat, memory, and revision timeline.`,
            },
          ],
        }
      : agent,
  )
  return {
    agents: seeded,
    agentTasks: [],
    communicationEvents: [],
    proposedPatches: [],
    revisions: [],
    memoryNotes: defaultMemoryNotes.map((note) => ({ ...note, id: `${note.id}-${uid()}` })),
    chatThreads: [],
  }
}
