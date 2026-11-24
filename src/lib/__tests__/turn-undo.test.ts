import { describe, expect, it } from 'vitest'
import type { Message, WorkspaceFile } from '@/components/ide/agent-types'
import type { EditRevision } from '@/lib/edit-memory'
import { computeTurnUndoPlan } from '@/lib/turn-undo'

describe('Turn Undo & File Checkpoint Rollback', () => {
  it('rewinds multiple file edits in reverse order, removes newly created files, and restores prompt text', () => {
    const files: WorkspaceFile[] = [
      { name: 'app.ts', path: 'src/app.ts', language: 'typescript', content: 'v3' },
      { name: 'new.ts', path: 'src/new.ts', language: 'typescript', content: 'created-by-turn-2' },
    ]
    const revisions: EditRevision[] = [
      {
        id: 'REV-001',
        path: 'src/app.ts',
        actor: 'PM',
        summary: 'Turn 1 edit',
        previousContent: 'v0',
        nextContent: 'v1',
        timestamp: '2026-11-25T00:00:01.000Z',
      },
      {
        id: 'REV-002',
        path: 'src/app.ts',
        actor: 'PM',
        summary: 'Turn 2 edit A',
        previousContent: 'v1',
        nextContent: 'v2',
        timestamp: '2026-11-25T00:01:01.000Z',
      },
      {
        id: 'REV-003',
        path: 'src/app.ts',
        actor: 'PM',
        summary: 'Turn 2 edit B',
        previousContent: 'v2',
        nextContent: 'v3',
        timestamp: '2026-11-25T00:01:02.000Z',
      },
      {
        id: 'REV-004',
        path: 'src/new.ts',
        actor: 'PM',
        summary: 'Turn 2 created file',
        previousContent: null,
        nextContent: 'created-by-turn-2',
        timestamp: '2026-11-25T00:01:03.000Z',
      },
    ]
    const messages: Message[] = [
      { id: 'm0', role: 'assistant', text: 'Ready' },
      { id: 'm1', role: 'user', text: 'First command', revisionCheckpoint: 0 },
      { id: 'm2', role: 'assistant', text: 'Done first' },
      { id: 'm3', role: 'user', text: 'Second command to undo', revisionCheckpoint: 1 },
      { id: 'm4', role: 'assistant', text: 'Edited app.ts and created new.ts' },
    ]

    const plan = computeTurnUndoPlan({
      messages,
      messageId: 'm3',
      revisions,
      files,
    })

    expect(plan.found).toBe(true)
    expect(plan.restoredPrompt).toBe('Second command to undo')
    expect(plan.nextMessages.map((m) => m.id)).toEqual(['m0', 'm1', 'm2'])
    expect(plan.revisionsToRollback.map((r) => r.id)).toEqual(['REV-002', 'REV-003', 'REV-004'])
    expect(plan.nextRevisions.map((r) => r.id)).toEqual(['REV-001'])
    expect(plan.nextFiles.find((f) => f.path === 'src/app.ts')?.content).toBe('v1')
    expect(plan.nextFiles.find((f) => f.path === 'src/new.ts')).toBeUndefined()
    expect(plan.diskWrites).toEqual([{ path: 'src/app.ts', content: 'v1' }])
    expect(plan.diskDeletes).toEqual(['src/new.ts'])
  })

  it('supports undoing legacy messages that only reference REV-xxx in subsequent tool logs', () => {
    const files: WorkspaceFile[] = [
      { name: 'page.tsx', path: 'src/page.tsx', language: 'typescript', content: 'after' },
    ]
    const revisions: EditRevision[] = [
      {
        id: 'REV-005',
        path: 'src/page.tsx',
        actor: 'FE',
        summary: 'Update page',
        previousContent: 'before',
        nextContent: 'after',
        timestamp: '2026-11-25T00:02:00.000Z',
      },
    ]
    const messages: Message[] = [
      { id: 'u1', role: 'user', text: 'Change page color' },
      { id: 't1', role: 'tool', text: 'Edited & saved src/page.tsx (REV-005) directly to disk.' },
      { id: 'a1', role: 'assistant', text: 'Updated!' },
    ]

    const plan = computeTurnUndoPlan({ messages, messageId: 'u1', revisions, files })
    expect(plan.found).toBe(true)
    expect(plan.restoredPrompt).toBe('Change page color')
    expect(plan.nextMessages).toEqual([])
    expect(plan.nextFiles[0].content).toBe('before')
    expect(plan.nextRevisions).toEqual([])
  })
})
