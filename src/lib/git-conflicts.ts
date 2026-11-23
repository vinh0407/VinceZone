export function resolveConflictBlocks(
  content: string,
  strategy: 'ours' | 'theirs' | 'both',
): { resolved: string; count: number } {
  const regex =
    /<<<<<<<[^\n]*\r?\n([\s\S]*?)=======\r?\n([\s\S]*?)>>>>>>>[^\n]*(?:\r?\n)?/g
  let count = 0
  const resolved = content.replace(regex, (_match, ours: string, theirs: string) => {
    count += 1
    if (strategy === 'ours') return ours
    if (strategy === 'theirs') return theirs
    return `${ours}${theirs}`
  })
  return { resolved, count }
}
