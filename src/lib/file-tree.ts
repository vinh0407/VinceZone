export type WorkspaceFileNode = {
  name: string
  path: string
  content: string
  language: string
  dirty?: boolean
  lazy?: boolean
  size?: number
}

export type FileTreeFolder = {
  type: 'folder'
  name: string
  path: string
  children: FileTreeItem[]
}

export type FileTreeFile = {
  type: 'file'
  name: string
  path: string
  file: WorkspaceFileNode
}

export type FileTreeItem = FileTreeFolder | FileTreeFile

export type SearchMatch = {
  path: string
  name: string
  line: number
  preview: string
}

export type DiffLine = {
  type: 'context' | 'added' | 'removed'
  leftNumber?: number
  rightNumber?: number
  text: string
}

export function inferLanguage(fileName: string): string {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.json')) return 'json'
  if (lower.endsWith('.css') || lower.endsWith('.scss')) return 'css'
  if (lower.endsWith('.html') || lower.endsWith('.htm')) return 'html'
  if (lower.endsWith('.md') || lower.endsWith('.mdx')) return 'markdown'
  if (lower.endsWith('.py')) return 'python'
  if (lower.endsWith('.rs')) return 'rust'
  if (lower.endsWith('.go')) return 'go'
  if (lower.endsWith('.yaml') || lower.endsWith('.yml')) return 'yaml'
  if (lower.endsWith('.sh') || lower.endsWith('.bash') || lower.endsWith('.zsh')) return 'shell'
  if (lower.endsWith('.sql')) return 'sql'
  if (
    lower.endsWith('.js') ||
    lower.endsWith('.jsx') ||
    lower.endsWith('.mjs') ||
    lower.endsWith('.cjs')
  ) {
    return 'javascript'
  }
  if (
    lower.endsWith('.ts') ||
    lower.endsWith('.tsx') ||
    lower.endsWith('.mts') ||
    lower.endsWith('.cts')
  ) {
    return 'typescript'
  }
  return 'plaintext'
}

export function normalizeImportedPath(rawPath: string, rootFolder?: string): string {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '')
  if (rootFolder && normalized.startsWith(`${rootFolder}/`)) {
    return normalized.slice(rootFolder.length + 1)
  }
  return normalized
}

export function buildFileTree(files: WorkspaceFileNode[]): FileTreeItem[] {
  const root: FileTreeFolder = { type: 'folder', name: '', path: '', children: [] }

  for (const file of files) {
    const cleanPath = file.path.replace(/\\/g, '/').replace(/^\/+/, '')
    const segments = cleanPath.split('/').filter(Boolean)
    if (segments.length === 0) continue

    let cursor = root
    for (let index = 0; index < segments.length - 1; index += 1) {
      const folderName = segments[index]
      const folderPath = segments.slice(0, index + 1).join('/')
      let existing = cursor.children.find(
        (child): child is FileTreeFolder => child.type === 'folder' && child.name === folderName,
      )
      if (!existing) {
        existing = { type: 'folder', name: folderName, path: folderPath, children: [] }
        cursor.children.push(existing)
      }
      cursor = existing
    }

    cursor.children.push({
      type: 'file',
      name: segments[segments.length - 1],
      path: file.path,
      file,
    })
  }

  const sortItems = (items: FileTreeItem[]): FileTreeItem[] =>
    items
      .map((item) =>
        item.type === 'folder' ? { ...item, children: sortItems(item.children) } : item,
      )
      .sort((a, b) => {
        if (a.type !== b.type) return a.type === 'folder' ? -1 : 1
        return a.name.localeCompare(b.name)
      })

  return sortItems(root.children)
}

export function searchWorkspaceFiles(
  files: WorkspaceFileNode[],
  query: string,
  maxResults = 60,
): SearchMatch[] {
  const term = query.trim().toLowerCase()
  if (!term) return []

  const results: SearchMatch[] = []
  for (const file of files) {
    if (file.path.toLowerCase().includes(term)) {
      results.push({
        path: file.path,
        name: file.name,
        line: 1,
        preview: file.path,
      })
      if (results.length >= maxResults) return results
    }

    const lines = file.content.split('\n')
    for (let index = 0; index < lines.length; index += 1) {
      if (lines[index].toLowerCase().includes(term)) {
        results.push({
          path: file.path,
          name: file.name,
          line: index + 1,
          preview: lines[index].trim().slice(0, 120),
        })
        if (results.length >= maxResults) return results
      }
    }
  }
  return results
}

export function hashText(input: string): string {
  let hash = 2166136261
  for (let index = 0; index < input.length; index += 1) {
    hash ^= input.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(16).padStart(8, '0')
}

export function computeLineDiff(beforeText: string, afterText: string): DiffLine[] {
  const left = beforeText === '' ? [] : beforeText.split('\n')
  const right = afterText === '' ? [] : afterText.split('\n')

  // Guard against huge quadratic DP tables on very large files
  if (left.length * right.length > 200_000) {
    return [
      ...left.map((text, index) => ({ type: 'removed' as const, leftNumber: index + 1, text })),
      ...right.map((text, index) => ({ type: 'added' as const, rightNumber: index + 1, text })),
    ]
  }

  const dp: number[][] = Array.from({ length: left.length + 1 }, () =>
    new Array<number>(right.length + 1).fill(0),
  )

  for (let i = left.length - 1; i >= 0; i -= 1) {
    for (let j = right.length - 1; j >= 0; j -= 1) {
      if (left[i] === right[j]) {
        dp[i][j] = dp[i + 1][j + 1] + 1
      } else {
        dp[i][j] = Math.max(dp[i + 1][j], dp[i][j + 1])
      }
    }
  }

  const diff: DiffLine[] = []
  let i = 0
  let j = 0
  while (i < left.length && j < right.length) {
    if (left[i] === right[j]) {
      diff.push({ type: 'context', leftNumber: i + 1, rightNumber: j + 1, text: left[i] })
      i += 1
      j += 1
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      diff.push({ type: 'removed', leftNumber: i + 1, text: left[i] })
      i += 1
    } else {
      diff.push({ type: 'added', rightNumber: j + 1, text: right[j] })
      j += 1
    }
  }
  while (i < left.length) {
    diff.push({ type: 'removed', leftNumber: i + 1, text: left[i] })
    i += 1
  }
  while (j < right.length) {
    diff.push({ type: 'added', rightNumber: j + 1, text: right[j] })
    j += 1
  }

  return diff
}

export function applyPatchToFiles(
  files: WorkspaceFileNode[],
  targetPath: string,
  newContent: string,
): { nextFiles: WorkspaceFileNode[]; previousContent: string | null } {
  const existing = files.find((file) => file.path === targetPath)
  if (existing) {
    return {
      previousContent: existing.content,
      nextFiles: files.map((file) =>
        file.path === targetPath ? { ...file, content: newContent, dirty: true } : file,
      ),
    }
  }

  const name = targetPath.split('/').pop() || targetPath
  return {
    previousContent: null,
    nextFiles: [
      ...files,
      {
        name,
        path: targetPath,
        content: newContent,
        language: inferLanguage(name),
        dirty: true,
      },
    ],
  }
}

export function rollbackPatchInFiles(
  files: WorkspaceFileNode[],
  targetPath: string,
  previousContent: string | null,
): WorkspaceFileNode[] {
  if (previousContent === null) {
    return files.filter((file) => file.path !== targetPath)
  }
  return files.map((file) =>
    file.path === targetPath ? { ...file, content: previousContent, dirty: true } : file,
  )
}
