import { describe, expect, it } from 'vitest'
import {
  createEditRevision,
  findRevisionForIntent,
  parseRollbackPrompt,
  type EditRevision,
} from '@/lib/edit-memory'

describe('VinceZone Edit Memory & natural-language rollback', () => {
  it('increments REV-001, REV-002 IDs and resolves rollback prompts', () => {
    const list: EditRevision[] = []
    const rev1 = createEditRevision(list, {
      path: 'src/app/page.tsx',
      actor: 'User',
      summary: 'Manual save',
      previousContent: 'v0',
      nextContent: 'v1',
    })
    list.push(rev1)
    const rev2 = createEditRevision(list, {
      path: 'src/components/dashboard.tsx',
      actor: 'Frontend Engineer (@FE)',
      summary: 'Update heading',
      previousContent: 'old',
      nextContent: 'new',
    })
    list.push(rev2)

    expect(rev1.id).toBe('REV-001')
    expect(rev2.id).toBe('REV-002')

    const byRev = parseRollbackPrompt('rollback REV-001')
    expect(byRev).toEqual({ kind: 'revision', revisionId: 'REV-001' })
    expect(findRevisionForIntent(list, byRev!)?.path).toBe('src/app/page.tsx')

    const byFile = parseRollbackPrompt('khôi phục file dashboard.tsx')
    expect(byFile).toEqual({ kind: 'file', fileQuery: 'dashboard.tsx' })
    expect(findRevisionForIntent(list, byFile!)?.id).toBe('REV-002')

    const latest = parseRollbackPrompt('hoàn tác')
    expect(latest).toEqual({ kind: 'latest' })
    expect(findRevisionForIntent(list, latest!)?.id).toBe('REV-002')
  })
})
