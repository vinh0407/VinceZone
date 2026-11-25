export type SymbolKind =
  | 'function'
  | 'class'
  | 'interface'
  | 'type'
  | 'enum'
  | 'const'
  | 'method'

export type SymbolDefinition = {
  name: string
  kind: SymbolKind
  path: string
  line: number
  column: number
  signature: string
  exported: boolean
}

function getExtension(filePath: string): string {
  const clean = filePath.replace(/\\/g, '/')
  const base = clean.split('/').pop() || clean
  const dot = base.lastIndexOf('.')
  return dot >= 0 ? base.slice(dot).toLowerCase() : ''
}

export function extractSymbolsFromSource(relPath: string, content: string): SymbolDefinition[] {
  const ext = getExtension(relPath)
  const lines = content.split(/\r?\n/)
  const out: SymbolDefinition[] = []
  const seen = new Set<string>()

  const push = (
    name: string,
    kind: SymbolKind,
    lineIdx: number,
    rawLine: string,
    exported: boolean,
  ) => {
    if (!name || name.length < 2) return
    const key = `${name}:${lineIdx}`
    if (seen.has(key)) return
    seen.add(key)
    const col = Math.max(1, rawLine.indexOf(name) + 1)
    out.push({
      name,
      kind,
      path: relPath,
      line: lineIdx + 1,
      column: col,
      signature: rawLine.trim().slice(0, 140),
      exported,
    })
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith('//') || trimmed.startsWith('*') || trimmed.startsWith('#')) {
      continue
    }

    // TypeScript / JavaScript
    if (
      ext === '.ts' ||
      ext === '.tsx' ||
      ext === '.mts' ||
      ext === '.cts' ||
      ext === '.js' ||
      ext === '.jsx' ||
      ext === '.mjs' ||
      ext === '.cjs'
    ) {
      const exported = /^export\s+/.test(trimmed)
      let m = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:async\s+)?function\s+([A-Za-z_$][\w$]*)/)
      if (m) {
        push(m[1], 'function', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:export\s+(?:default\s+)?)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/)
      if (m) {
        push(m[1], 'class', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:export\s+)?interface\s+([A-Za-z_$][\w$]*)/)
      if (m) {
        push(m[1], 'interface', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:export\s+)?type\s+([A-Za-z_$][\w$]*)\s*(?:<[^>]+>)?\s*=/)
      if (m) {
        push(m[1], 'type', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:export\s+)?(?:const\s+)?enum\s+([A-Za-z_$][\w$]*)/)
      if (m) {
        push(m[1], 'enum', i, line, exported)
        continue
      }
      m = trimmed.match(
        /^(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*(?::[^=]+)?=\s*(?:async\s+)?(?:\(|[A-Za-z_$][\w$]*\s*=>|function\b)/,
      )
      if (m) {
        push(m[1], 'function', i, line, exported)
        continue
      }
      if (exported) {
        m = trimmed.match(/^export\s+(?:const|let|var)\s+([A-Za-z_$][\w$]*)\b/)
        if (m) {
          push(m[1], 'const', i, line, true)
          continue
        }
      }
      continue
    }

    // Python
    if (ext === '.py') {
      let m = trimmed.match(/^(?:async\s+)?def\s+([A-Za-z_]\w*)\s*\(/)
      if (m) {
        const isMethod = /^\s+/.test(line)
        push(m[1], isMethod ? 'method' : 'function', i, line, !m[1].startsWith('_'))
        continue
      }
      m = trimmed.match(/^class\s+([A-Za-z_]\w*)/)
      if (m) {
        push(m[1], 'class', i, line, !m[1].startsWith('_'))
        continue
      }
      continue
    }

    // Kotlin / Java
    if (ext === '.kt' || ext === '.kts' || ext === '.java') {
      let m = trimmed.match(
        /^(?:(?:public|private|protected|internal|override|suspend|inline|static|final)\s+)*fun\s+(?:<[^>]+>\s+)?([A-Za-z_]\w*)\s*\(/,
      )
      if (m) {
        push(m[1], 'function', i, line, !trimmed.includes('private '))
        continue
      }
      m = trimmed.match(
        /^(?:(?:public|private|protected|internal|data|sealed|abstract|open|final)\s+)*(class|interface|object|enum)\s+([A-Za-z_]\w*)/,
      )
      if (m) {
        const kind: SymbolKind =
          m[1] === 'interface' ? 'interface' : m[1] === 'enum' ? 'enum' : 'class'
        push(m[2], kind, i, line, !trimmed.includes('private '))
        continue
      }
      continue
    }

    // Go
    if (ext === '.go') {
      let m = trimmed.match(/^func\s+(?:\([^)]+\)\s+)?([A-Za-z_]\w*)\s*\(/)
      if (m) {
        push(m[1], 'function', i, line, /^[A-Z]/.test(m[1]))
        continue
      }
      m = trimmed.match(/^type\s+([A-Za-z_]\w*)\s+(struct|interface)\b/)
      if (m) {
        push(m[1], m[2] === 'interface' ? 'interface' : 'class', i, line, /^[A-Z]/.test(m[1]))
        continue
      }
      continue
    }

    // Rust
    if (ext === '.rs') {
      const exported = /^pub\b/.test(trimmed)
      let m = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?(?:async\s+)?fn\s+([A-Za-z_]\w*)/)
      if (m) {
        push(m[1], 'function', i, line, exported)
        continue
      }
      m = trimmed.match(/^(?:pub(?:\([^)]*\))?\s+)?(struct|enum|trait|type)\s+([A-Za-z_]\w*)/)
      if (m) {
        const kind: SymbolKind =
          m[1] === 'trait'
            ? 'interface'
            : m[1] === 'enum'
              ? 'enum'
              : m[1] === 'type'
                ? 'type'
                : 'class'
        push(m[2], kind, i, line, exported)
      }
    }
  }

  return out
}
