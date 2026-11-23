import { describe, expect, it } from 'vitest'
import {
  parseInlineMarkdown,
  parseMarkdownBlocks,
  parseMermaidDiagram,
} from '@/lib/markdown-parser'

describe('VinceZone Markdown, Table & Mermaid Reply Parser', () => {
  it('parses headings, bold, tables, callouts, lists, and code blocks cleanly', () => {
    const sample = [
      '# BÁO CÁO PHÂN TÍCH DỰ ÁN',
      '',
      '## 1. Tech Stack',
      '| Lớp | Công nghệ | Vai trò |',
      '| :--- | :---: | ---: |',
      '| **Frontend** | `Next.js 16` | UI Shell |',
      '| **Desktop** | `Electron 35` | Local App |',
      '',
      '> [!TIP] Dùng `/combo:combo-01-token-saver` để tiết kiệm token.',
      '',
      '- [x] Đã kiểm thử **Vitest**',
      '- [ ] Chưa thêm PTY',
      '',
      '```ts',
      'export const ok = true',
      '```',
    ].join('\n')

    const blocks = parseMarkdownBlocks(sample)
    expect(blocks.map((b) => b.type)).toEqual([
      'heading',
      'heading',
      'table',
      'callout',
      'list',
      'code',
    ])

    const table = blocks[2]
    expect(table.type).toBe('table')
    if (table.type === 'table') {
      expect(table.headers).toEqual(['Lớp', 'Công nghệ', 'Vai trò'])
      expect(table.alignments).toEqual(['left', 'center', 'right'])
      expect(table.rows).toHaveLength(2)
    }

    const callout = blocks[3]
    expect(callout.type).toBe('callout')
    if (callout.type === 'callout') {
      expect(callout.variant).toBe('tip')
    }
  })

  it('parses bold, inline code, links, /skills and @mentions inline', () => {
    const tokens = parseInlineMarkdown(
      '**VinceZone** dùng `Electron` với /playwright-cli và @PM [docs](https://example.com)',
    )
    expect(tokens.some((t) => t.type === 'bold' && t.text === 'VinceZone')).toBe(true)
    expect(tokens.some((t) => t.type === 'code' && t.text === 'Electron')).toBe(true)
    expect(tokens.some((t) => t.type === 'slash' && t.text === '/playwright-cli')).toBe(true)
    expect(tokens.some((t) => t.type === 'mention' && t.text === '@PM')).toBe(true)
    expect(tokens.some((t) => t.type === 'link' && t.href === 'https://example.com')).toBe(true)
  })

  it('parses Mermaid flowcharts and sequence diagrams for native SVG rendering', () => {
    const flow = parseMermaidDiagram(
      'flowchart LR\n  A[User Prompt] --> B{PM Orchestrator}\n  B -->|delegate| C[FE / BE Agents]\n  C --> D[(Disk Workspace)]',
    )
    expect(flow.kind).toBe('flowchart')
    if (flow.kind === 'flowchart') {
      expect(flow.direction).toBe('LR')
      expect(flow.nodes).toHaveLength(4)
      expect(flow.edges).toHaveLength(3)
      expect(flow.edges[1].label).toBe('delegate')
    }

    const seq = parseMermaidDiagram(
      'sequenceDiagram\n  PM->>BE: Fix API bug\n  BE-->>PM: Saved & tested',
    )
    expect(seq.kind).toBe('sequence')
    if (seq.kind === 'sequence') {
      expect(seq.participants).toEqual(['PM', 'BE'])
      expect(seq.messages).toHaveLength(2)
      expect(seq.messages[1].dashed).toBe(true)
    }
  })
})
