import { describe, expect, it } from 'vitest'
import {
  applyPatchToFiles,
  buildFileTree,
  computeLineDiff,
  normalizeImportedPath,
  rollbackPatchInFiles,
  searchWorkspaceFiles,
  type WorkspaceFileNode,
} from '@/lib/file-tree'

const sampleFiles: WorkspaceFileNode[] = [
  {
    name: 'page.tsx',
    path: 'src/app/page.tsx',
    language: 'typescript',
    content: 'export default function Home() {\n  return <main>Hello</main>\n}\n',
  },
  {
    name: 'package.json',
    path: 'package.json',
    language: 'json',
    content: '{\n  "name": "baton-demo"\n}\n',
  },
]

describe('file-tree and diff utilities', () => {
  it('strips root folder prefix from webkitRelativePath and builds nested tree', () => {
    expect(normalizeImportedPath('my-app/src/app/page.tsx', 'my-app')).toBe('src/app/page.tsx')
    const tree = buildFileTree(sampleFiles)
    expect(tree[0].type).toBe('folder')
    expect(tree[0].name).toBe('src')
    expect(tree[1].type).toBe('file')
    expect(tree[1].name).toBe('package.json')
  })

  it('searches across file paths and line contents with line numbers', () => {
    const matches = searchWorkspaceFiles(sampleFiles, 'Hello')
    expect(matches).toHaveLength(1)
    expect(matches[0]).toMatchObject({ path: 'src/app/page.tsx', line: 2 })
  })

  it('computes accurate line diffs and supports apply + rollback', () => {
    const diff = computeLineDiff('a\nb\nc', 'a\nb2\nc\nd')
    expect(diff.some((line) => line.type === 'removed' && line.text === 'b')).toBe(true)
    expect(diff.some((line) => line.type === 'added' && line.text === 'b2')).toBe(true)
    expect(diff.some((line) => line.type === 'added' && line.text === 'd')).toBe(true)

    const { nextFiles, previousContent } = applyPatchToFiles(
      sampleFiles,
      'src/app/page.tsx',
      'export default function Home() { return <main>Updated</main> }\n',
    )
    expect(nextFiles[0].dirty).toBe(true)
    expect(nextFiles[0].content).toContain('Updated')

    const rolledBack = rollbackPatchInFiles(nextFiles, 'src/app/page.tsx', previousContent)
    expect(rolledBack[0].content).toBe(sampleFiles[0].content)
  })
})
