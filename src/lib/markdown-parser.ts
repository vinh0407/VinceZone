/**
 * Zero-dependency, offline-safe GitHub-Flavored Markdown (GFM) & Mermaid diagram parser
 * tailored for VinceZone Studio AI Agent replies.
 */

export type MarkdownAlignment = 'left' | 'center' | 'right'

export type MarkdownBlock =
  | { type: 'heading'; level: 1 | 2 | 3 | 4; text: string }
  | { type: 'hr' }
  | {
      type: 'table'
      headers: string[]
      alignments: MarkdownAlignment[]
      rows: string[][]
    }
  | { type: 'code'; language: string; content: string }
  | { type: 'mermaid'; content: string }
  | {
      type: 'callout'
      variant: 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'quote'
      lines: string[]
    }
  | {
      type: 'list'
      ordered: boolean
      items: Array<{ text: string; checked?: boolean; indent: number }>
    }
  | { type: 'paragraph'; text: string }

export type InlineToken =
  | { type: 'text'; text: string }
  | { type: 'bold-italic'; text: string }
  | { type: 'bold'; text: string }
  | { type: 'italic'; text: string }
  | { type: 'strike'; text: string }
  | { type: 'code'; text: string }
  | { type: 'link'; label: string; href: string }
  | { type: 'slash'; text: string }
  | { type: 'mention'; text: string }

export type MermaidFlowNode = {
  id: string
  label: string
  shape: 'rect' | 'round' | 'diamond' | 'circle' | 'db'
}

export type MermaidFlowEdge = {
  from: string
  to: string
  label?: string
  dashed?: boolean
}

export type ParsedMermaidDiagram =
  | {
      kind: 'flowchart'
      direction: 'TD' | 'LR'
      nodes: MermaidFlowNode[]
      edges: MermaidFlowEdge[]
    }
  | {
      kind: 'sequence'
      participants: string[]
      messages: Array<{ from: string; to: string; label: string; dashed: boolean }>
    }
  | { kind: 'unsupported' }

function splitTableRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  const cells: string[] = []
  let current = ''
  let inCode = false
  for (let i = 0; i < trimmed.length; i += 1) {
    const ch = trimmed[i]
    if (ch === '`') inCode = !inCode
    if (ch === '|' && !inCode && trimmed[i - 1] !== '\\') {
      cells.push(current.trim().replace(/\\\|/g, '|'))
      current = ''
    } else {
      current += ch
    }
  }
  cells.push(current.trim().replace(/\\\|/g, '|'))
  return cells
}

function isTableSeparator(line: string): boolean {
  const trimmed = line.trim()
  if (!trimmed.includes('|') || !trimmed.includes('-')) return false
  const cells = splitTableRow(trimmed)
  return cells.length >= 2 && cells.every((cell) => /^:?-{2,}:?$/.test(cell.replace(/\s+/g, '')))
}

function parseTableAlignments(line: string): MarkdownAlignment[] {
  return splitTableRow(line).map((cell) => {
    const clean = cell.replace(/\s+/g, '')
    if (clean.startsWith(':') && clean.endsWith(':')) return 'center'
    if (clean.endsWith(':')) return 'right'
    return 'left'
  })
}

export function parseMarkdownBlocks(raw: string): MarkdownBlock[] {
  const normalized = raw.replace(/\r\n/g, '\n')
  const lines = normalized.split('\n')
  const blocks: MarkdownBlock[] = []
  let i = 0

  const isBlockStarter = (idx: number): boolean => {
    const line = lines[idx] ?? ''
    const trimmed = line.trim()
    if (!trimmed) return true
    if (/^```/.test(trimmed)) return true
    if (/^#{1,4}\s+/.test(trimmed)) return true
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) return true
    if (/^>\s?/.test(trimmed)) return true
    if (/^\s*(?:[-*•]|\d+[.)])\s+/.test(line)) return true
    if (trimmed.includes('|') && idx + 1 < lines.length && isTableSeparator(lines[idx + 1])) {
      return true
    }
    return false
  }

  while (i < lines.length) {
    const line = lines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      i += 1
      continue
    }

    // 1. Fenced code block or Mermaid diagram
    const fenceMatch = trimmed.match(/^```([a-z0-9_.:/-]*)(?:\s+(.*))?$/i)
    if (fenceMatch) {
      const langRaw = (fenceMatch[1] || '').trim()
      const extraTitle = (fenceMatch[2] || '').trim()
      const lang = extraTitle ? `${langRaw} ${extraTitle}`.trim() : langRaw
      const codeLines: string[] = []
      i += 1
      while (i < lines.length && !/^```\s*$/.test(lines[i].trim())) {
        codeLines.push(lines[i])
        i += 1
      }
      if (i < lines.length && /^```\s*$/.test(lines[i].trim())) i += 1
      const content = codeLines.join('\n')
      if (langRaw.toLowerCase() === 'mermaid') {
        blocks.push({ type: 'mermaid', content })
      } else {
        blocks.push({ type: 'code', language: lang || 'text', content })
      }
      continue
    }

    // 2. Horizontal rule
    if (/^(?:-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      blocks.push({ type: 'hr' })
      i += 1
      continue
    }

    // 3. Heading (#, ##, ###, ####)
    const headingMatch = trimmed.match(/^(#{1,4})\s+(.+?)\s*#*$/)
    if (headingMatch) {
      blocks.push({
        type: 'heading',
        level: Math.min(4, headingMatch[1].length) as 1 | 2 | 3 | 4,
        text: headingMatch[2].trim(),
      })
      i += 1
      continue
    }

    // 4. GFM Table
    if (trimmed.includes('|') && i + 1 < lines.length && isTableSeparator(lines[i + 1])) {
      const headers = splitTableRow(trimmed)
      const alignments = parseTableAlignments(lines[i + 1])
      i += 2
      const rows: string[][] = []
      while (i < lines.length) {
        const rowLine = lines[i].trim()
        if (!rowLine || !rowLine.includes('|')) break
        rows.push(splitTableRow(rowLine))
        i += 1
      }
      blocks.push({ type: 'table', headers, alignments, rows })
      continue
    }

    // 5. Blockquote / GitHub Callout (> [!NOTE], > [!TIP], > [!WARNING]...)
    if (/^>\s?/.test(trimmed)) {
      const quoteLines: string[] = []
      while (i < lines.length && /^>\s?/.test(lines[i].trim())) {
        quoteLines.push(lines[i].trim().replace(/^>\s?/, ''))
        i += 1
      }
      let variant: 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'quote' = 'quote'
      const first = quoteLines[0] || ''
      const calloutMatch = first.match(/^\[!(NOTE|TIP|IMPORTANT|WARNING|CAUTION)\]\s*(.*)$/i)
      if (calloutMatch) {
        variant = calloutMatch[1].toLowerCase() as typeof variant
        if (calloutMatch[2].trim()) {
          quoteLines[0] = calloutMatch[2].trim()
        } else {
          quoteLines.shift()
        }
      }
      blocks.push({ type: 'callout', variant, lines: quoteLines })
      continue
    }

    // 6. Ordered or Unordered List (with optional task checkboxes)
    const firstListMatch = line.match(/^(\s*)(?:([-*•])|(\d+)[.)])\s+(.*)$/)
    if (firstListMatch) {
      const ordered = Boolean(firstListMatch[3])
      const items: Array<{ text: string; checked?: boolean; indent: number }> = []
      while (i < lines.length) {
        const m = lines[i].match(/^(\s*)(?:([-*•])|(\d+)[.)])\s+(.*)$/)
        if (!m) break
        const isCurrentOrdered = Boolean(m[3])
        if (isCurrentOrdered !== ordered && m[1].length === 0) break
        const indent = Math.min(3, Math.floor(m[1].length / 2))
        let itemText = m[4].trim()
        let checked: boolean | undefined
        const taskMatch = itemText.match(/^\[([ xX])\]\s+(.*)$/)
        if (taskMatch) {
          checked = taskMatch[1].toLowerCase() === 'x'
          itemText = taskMatch[2]
        }
        items.push({ text: itemText, checked, indent })
        i += 1
      }
      blocks.push({ type: 'list', ordered, items })
      continue
    }

    // 7. Paragraph (consume consecutive non-block lines)
    const paraLines: string[] = [trimmed]
    i += 1
    while (i < lines.length && !isBlockStarter(i)) {
      paraLines.push(lines[i].trim())
      i += 1
    }
    blocks.push({ type: 'paragraph', text: paraLines.join('\n') })
  }

  return blocks
}

export function parseInlineMarkdown(text: string): InlineToken[] {
  if (!text) return []
  const tokens: InlineToken[] = []
  const pattern =
    /(`[^`\n]+`|\*\*\*[^*\n]+?\*\*\*|\*\*[^*\n]+?\*\*|__[^_\n]+?__|~~[^~\n]+?~~|\*[^*\n]+?\*|\[([^\]]+)\]\((https?:\/\/[^\s)]+|file:\/\/\/[^\s)]+)\)|(?:^|(?<=[\s(]))(\/(?:combo|mcp|plugin):[a-z0-9._-]+|\/[a-z][a-z0-9._-]+|@[A-Z]{2,8}|@(?:folder|browser|drive):[^\s]+)(?=$|[\s),.;!?]))/g

  let cursor = 0
  let match: RegExpExecArray | null

  while ((match = pattern.exec(text)) !== null) {
    if (match.index > cursor) {
      tokens.push({ type: 'text', text: text.slice(cursor, match.index) })
    }
    const raw = match[1]
    if (raw.startsWith('`') && raw.endsWith('`')) {
      tokens.push({ type: 'code', text: raw.slice(1, -1) })
    } else if (raw.startsWith('***') && raw.endsWith('***')) {
      tokens.push({ type: 'bold-italic', text: raw.slice(3, -3) })
    } else if (
      (raw.startsWith('**') && raw.endsWith('**')) ||
      (raw.startsWith('__') && raw.endsWith('__'))
    ) {
      tokens.push({ type: 'bold', text: raw.slice(2, -2) })
    } else if (raw.startsWith('~~') && raw.endsWith('~~')) {
      tokens.push({ type: 'strike', text: raw.slice(2, -2) })
    } else if (raw.startsWith('*') && raw.endsWith('*')) {
      tokens.push({ type: 'italic', text: raw.slice(1, -1) })
    } else if (match[2] && match[3]) {
      tokens.push({ type: 'link', label: match[2], href: match[3] })
    } else if (match[4]) {
      tokens.push({
        type: match[4].startsWith('/') ? 'slash' : 'mention',
        text: match[4],
      })
    } else {
      tokens.push({ type: 'text', text: raw })
    }
    cursor = match.index + raw.length
  }

  if (cursor < text.length) {
    tokens.push({ type: 'text', text: text.slice(cursor) })
  }
  return tokens
}

function parseMermaidNodeSpec(raw: string): MermaidFlowNode | null {
  const clean = raw.trim()
  if (!clean) return null

  const dbMatch = clean.match(/^([A-Za-z0-9_-]+)\[\((.+)\)\]$/)
  if (dbMatch) {
    return { id: dbMatch[1], label: dbMatch[2].replace(/^["']|["']$/g, ''), shape: 'db' }
  }
  const circleMatch = clean.match(/^([A-Za-z0-9_-]+)\(\((.+)\)\)$/)
  if (circleMatch) {
    return {
      id: circleMatch[1],
      label: circleMatch[2].replace(/^["']|["']$/g, ''),
      shape: 'circle',
    }
  }
  const diamondMatch = clean.match(/^([A-Za-z0-9_-]+)\{(.+)\}$/)
  if (diamondMatch) {
    return {
      id: diamondMatch[1],
      label: diamondMatch[2].replace(/^["']|["']$/g, ''),
      shape: 'diamond',
    }
  }
  const roundMatch = clean.match(/^([A-Za-z0-9_-]+)\((.+)\)$/)
  if (roundMatch) {
    return {
      id: roundMatch[1],
      label: roundMatch[2].replace(/^["']|["']$/g, ''),
      shape: 'round',
    }
  }
  const rectMatch = clean.match(/^([A-Za-z0-9_-]+)\[(.+)\]$/)
  if (rectMatch) {
    return {
      id: rectMatch[1],
      label: rectMatch[2].replace(/^["']|["']$/g, ''),
      shape: 'rect',
    }
  }
  const bareMatch = clean.match(/^([A-Za-z0-9_-]+)$/)
  if (bareMatch) {
    return { id: bareMatch[1], label: bareMatch[1], shape: 'rect' }
  }
  return null
}

/**
 * Lightweight, 100% offline Mermaid parser supporting `flowchart`/`graph` (TD/LR)
 * and `sequenceDiagram` so diagrams render as crisp interactive SVG right inside chat.
 */
export function parseMermaidDiagram(source: string): ParsedMermaidDiagram {
  const lines = source
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('%%'))

  if (!lines.length) return { kind: 'unsupported' }

  const header = lines[0]

  // 1) Sequence Diagram
  if (/^sequenceDiagram\b/i.test(header)) {
    const participants: string[] = []
    const messages: Array<{ from: string; to: string; label: string; dashed: boolean }> = []
    const ensureP = (name: string) => {
      if (!participants.includes(name)) participants.push(name)
    }

    for (const line of lines.slice(1)) {
      const pMatch = line.match(/^participant\s+([^\s]+)(?:\s+as\s+(.+))?$/i)
      if (pMatch) {
        ensureP((pMatch[2] || pMatch[1]).trim())
        continue
      }
      const msgMatch = line.match(/^([^-\s]+)\s*(-->>|->>|-->|->)\s*([^:\s]+)\s*:\s*(.+)$/)
      if (msgMatch) {
        const from = msgMatch[1].trim()
        const to = msgMatch[3].trim()
        ensureP(from)
        ensureP(to)
        messages.push({
          from,
          to,
          label: msgMatch[4].trim(),
          dashed: msgMatch[2].startsWith('--'),
        })
      }
    }

    if (participants.length >= 2 && messages.length >= 1) {
      return { kind: 'sequence', participants, messages }
    }
    return { kind: 'unsupported' }
  }

  // 2) Flowchart / Graph
  const flowMatch = header.match(/^(?:flowchart|graph)\s+(TD|TB|LR|RL|BT)?/i)
  if (flowMatch) {
    const dirToken = (flowMatch[1] || 'TD').toUpperCase()
    const direction: 'TD' | 'LR' = dirToken === 'LR' || dirToken === 'RL' ? 'LR' : 'TD'
    const nodeMap = new Map<string, MermaidFlowNode>()
    const edges: MermaidFlowEdge[] = []

    const upsertNode = (node: MermaidFlowNode) => {
      const existing = nodeMap.get(node.id)
      if (!existing || (existing.label === existing.id && node.label !== node.id)) {
        nodeMap.set(node.id, node)
      }
    }

    for (const line of lines.slice(1)) {
      if (/^(?:subgraph|end|style|classDef|class|click)\b/i.test(line)) continue

      // Match edge forms: A --> B, A -->|label| B, A -- label --> B, A -.-> B, A ==> B
      const edgeMatch = line.match(
        /^(.+?)\s*(?:--\s*([^->|]+?)\s*(-->|-\.->|==>)|(-->|--->|-\.->|==>)(?:\|([^|]+)\|)?)\s*(.+)$/,
      )
      if (edgeMatch) {
        const leftNode = parseMermaidNodeSpec(edgeMatch[1])
        const rightNode = parseMermaidNodeSpec(edgeMatch[6])
        if (leftNode && rightNode) {
          upsertNode(leftNode)
          upsertNode(rightNode)
          const arrow = edgeMatch[3] || edgeMatch[4] || '-->'
          const label = (edgeMatch[2] || edgeMatch[5] || '').trim() || undefined
          edges.push({
            from: leftNode.id,
            to: rightNode.id,
            label,
            dashed: arrow.includes('.'),
          })
          continue
        }
      }

      const standalone = parseMermaidNodeSpec(line)
      if (standalone) upsertNode(standalone)
    }

    const nodes = [...nodeMap.values()]
    if (nodes.length >= 1) {
      return { kind: 'flowchart', direction, nodes, edges }
    }
  }

  return { kind: 'unsupported' }
}
