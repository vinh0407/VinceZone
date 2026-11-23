'use client'

import {
  AlertTriangle,
  Check,
  Code2,
  Copy,
  GitBranch,
  Info,
  Lightbulb,
  ShieldAlert,
  Sparkles,
} from 'lucide-react'
import { useMemo, useState } from 'react'
import {
  type InlineToken,
  type MarkdownBlock,
  type ParsedMermaidDiagram,
  parseInlineMarkdown,
  parseMarkdownBlocks,
  parseMermaidDiagram,
} from '@/lib/markdown-parser'

function InlineContent({ text }: { text: string }) {
  const tokens = useMemo(() => parseInlineMarkdown(text), [text])
  return (
    <>
      {tokens.map((tok: InlineToken, idx: number) => {
        switch (tok.type) {
          case 'bold-italic':
            return (
              <strong key={idx} className="font-bold italic text-white">
                {tok.text}
              </strong>
            )
          case 'bold':
            return (
              <strong key={idx} className="font-bold text-white">
                {tok.text}
              </strong>
            )
          case 'italic':
            return (
              <em key={idx} className="italic text-[#e5e5e5]">
                {tok.text}
              </em>
            )
          case 'strike':
            return (
              <del key={idx} className="text-[#858585] line-through">
                {tok.text}
              </del>
            )
          case 'code':
            return (
              <code
                key={idx}
                className="rounded border border-[#353535] bg-[#242424] px-1.5 py-0.5 font-mono text-[0.92em] text-[#f5f5f5]"
              >
                {tok.text}
              </code>
            )
          case 'link':
            return (
              <a
                key={idx}
                href={tok.href}
                target="_blank"
                rel="noreferrer"
                className="font-medium text-[#9cdcfe] underline decoration-[#9cdcfe]/40 underline-offset-2 hover:text-white hover:decoration-white"
              >
                {tok.label}
              </a>
            )
          case 'slash':
            return (
              <span
                key={idx}
                className="rounded bg-white/15 px-1 py-0.5 font-mono font-bold text-white ring-1 ring-white/25"
              >
                {tok.text}
              </span>
            )
          case 'mention':
            return (
              <span
                key={idx}
                className="rounded bg-white/10 px-1 py-0.5 font-mono font-semibold text-[#f5f5f5]"
              >
                {tok.text}
              </span>
            )
          default:
            return <span key={idx}>{tok.text}</span>
        }
      })}
    </>
  )
}

function highlightCodeLine(line: string) {
  const trimmed = line.trimStart()
  if (trimmed.startsWith('//') || trimmed.startsWith('# ') || trimmed.startsWith('/*')) {
    return <span className="text-[#787878]">{line}</span>
  }
  const tokenRegex =
    /("(?:[^"\\]|\\.)*"|'(?:[^'\\]|\\.)*'|`(?:[^`\\]|\\.)*`|\b(?:import|export|from|const|let|var|function|async|await|return|if|else|for|while|switch|case|try|catch|throw|new|class|interface|type|extends|implements|def|class|pass|True|False|None|public|private|package|val)\b|\b\d+(?:\.\d+)?\b)/g
  const parts: React.ReactNode[] = []
  let last = 0
  let m: RegExpExecArray | null
  let k = 0
  while ((m = tokenRegex.exec(line)) !== null) {
    if (m.index > last) {
      parts.push(<span key={k++}>{line.slice(last, m.index)}</span>)
    }
    const v = m[0]
    if (v.startsWith('"') || v.startsWith("'") || v.startsWith('`')) {
      parts.push(
        <span key={k++} className="text-[#ce9178]">
          {v}
        </span>,
      )
    } else if (/^\d/.test(v)) {
      parts.push(
        <span key={k++} className="text-[#b5cea8]">
          {v}
        </span>,
      )
    } else {
      parts.push(
        <span key={k++} className="font-medium text-[#c586c0]">
          {v}
        </span>,
      )
    }
    last = m.index + v.length
  }
  if (last < line.length) {
    parts.push(<span key={k++}>{line.slice(last)}</span>)
  }
  return parts.length ? parts : line
}

function CodeBlockCard({
  language,
  content,
  large = false,
}: {
  language: string
  content: string
  large?: boolean
}) {
  const [copied, setCopied] = useState(false)
  const isAsciiDiagram = /[┌┐└┘├┤┬┴┼─│▼▲►◄→←↓↑]/.test(content)

  const handleCopy = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[#323232] bg-[#101010]">
      <div
        className={`flex items-center justify-between border-b border-[#262626] bg-[#181818] ${
          large ? 'px-3.5 py-2' : 'px-2.5 py-1'
        }`}
      >
        <span
          className={`flex items-center gap-1.5 font-mono uppercase tracking-wider text-[#9d9d9d] ${
            large ? 'text-[11.5px]' : 'text-[9.5px]'
          }`}
        >
          {isAsciiDiagram ? (
            <GitBranch size={large ? 14 : 11} />
          ) : (
            <Code2 size={large ? 14 : 11} />
          )}
          {isAsciiDiagram && language === 'text' ? 'diagram' : language}
        </span>
        <button
          type="button"
          onClick={handleCopy}
          className={`flex items-center gap-1 rounded px-2 py-0.5 text-[#a3a3a3] transition hover:bg-[#2a2a2a] hover:text-white ${
            large ? 'text-[11.5px]' : 'text-[9.5px]'
          }`}
        >
          {copied ? (
            <Check size={large ? 13 : 10} className="text-white" />
          ) : (
            <Copy size={large ? 13 : 10} />
          )}
          {copied ? 'Copied' : 'Copy'}
        </button>
      </div>
      <pre
        className={`overflow-x-auto font-mono text-[#e5e5e5] ${
          large ? 'p-3.5 text-[13px] leading-[1.65]' : 'p-2.5 text-[10.5px] leading-[1.6]'
        }`}
      >
        <code>
          {isAsciiDiagram
            ? content
            : content.split('\n').map((line, i) => (
                <div key={i} className="min-h-[1em]">
                  {highlightCodeLine(line)}
                </div>
              ))}
        </code>
      </pre>
    </div>
  )
}

function MermaidDiagramCard({ content }: { content: string }) {
  const [showRaw, setShowRaw] = useState(false)
  const [copied, setCopied] = useState(false)
  const parsed: ParsedMermaidDiagram = useMemo(() => parseMermaidDiagram(content), [content])

  const handleCopy = () => {
    if (navigator.clipboard) {
      void navigator.clipboard.writeText(content)
      setCopied(true)
      window.setTimeout(() => setCopied(false), 1600)
    }
  }

  const renderSvg = () => {
    if (parsed.kind === 'sequence') {
      const colWidth = 136
      const padX = 24
      const headerY = 18
      const rowStep = 44
      const width = Math.max(320, parsed.participants.length * colWidth + padX * 2)
      const height = 84 + parsed.messages.length * rowStep

      const colCenter = (name: string) =>
        padX + parsed.participants.indexOf(name) * colWidth + colWidth / 2

      return (
        <svg viewBox={`0 0 ${width} ${height}`} className="h-auto w-full min-w-[300px]">
          <defs>
            <marker
              id="vz-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#e5e5e5" />
            </marker>
          </defs>

          {parsed.participants.map((p) => {
            const cx = colCenter(p)
            return (
              <g key={p}>
                <line
                  x1={cx}
                  y1={headerY + 28}
                  x2={cx}
                  y2={height - 14}
                  stroke="#363636"
                  strokeDasharray="4 4"
                />
                <rect
                  x={cx - 56}
                  y={headerY}
                  width={112}
                  height={28}
                  rx={6}
                  fill="#222222"
                  stroke="#4a4a4a"
                />
                <text
                  x={cx}
                  y={headerY + 18}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10.5"
                  fontWeight="600"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {p.slice(0, 16)}
                </text>
              </g>
            )
          })}

          {parsed.messages.map((msg, idx) => {
            const x1 = colCenter(msg.from)
            const x2 = colCenter(msg.to)
            const y = 74 + idx * rowStep
            const midX = (x1 + x2) / 2
            return (
              <g key={idx}>
                <line
                  x1={x1}
                  y1={y}
                  x2={x2 + (x2 > x1 ? -6 : 6)}
                  y2={y}
                  stroke="#d4d4d4"
                  strokeWidth="1.4"
                  strokeDasharray={msg.dashed ? '4 3' : undefined}
                  markerEnd="url(#vz-arrow)"
                />
                <text
                  x={midX}
                  y={y - 6}
                  textAnchor="middle"
                  fill="#cccccc"
                  fontSize="9.5"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {msg.label.slice(0, 34)}
                </text>
              </g>
            )
          })}
        </svg>
      )
    }

    if (parsed.kind === 'flowchart') {
      // Assign topological ranks via BFS so layered layout stays neat & readable
      const inDegree = new Map<string, number>()
      const adj = new Map<string, string[]>()
      for (const n of parsed.nodes) {
        inDegree.set(n.id, 0)
        adj.set(n.id, [])
      }
      for (const e of parsed.edges) {
        adj.get(e.from)?.push(e.to)
        inDegree.set(e.to, (inDegree.get(e.to) ?? 0) + 1)
      }

      const rank = new Map<string, number>()
      const queue = parsed.nodes.filter((n) => (inDegree.get(n.id) ?? 0) === 0).map((n) => n.id)
      if (!queue.length && parsed.nodes.length) queue.push(parsed.nodes[0].id)
      for (const id of queue) rank.set(id, 0)

      let cursor = 0
      while (cursor < queue.length) {
        const current = queue[cursor++]
        const currRank = rank.get(current) ?? 0
        for (const next of adj.get(current) ?? []) {
          if (!rank.has(next)) {
            rank.set(next, currRank + 1)
            queue.push(next)
          }
        }
      }
      for (const n of parsed.nodes) {
        if (!rank.has(n.id)) rank.set(n.id, 0)
      }

      const layers = new Map<number, typeof parsed.nodes>()
      for (const n of parsed.nodes) {
        const r = rank.get(n.id) ?? 0
        const bucket = layers.get(r) ?? []
        bucket.push(n)
        layers.set(r, bucket)
      }

      const sortedRanks = [...layers.keys()].sort((a, b) => a - b)
      const isLR = parsed.direction === 'LR'
      const nodeW = 148
      const nodeH = 42
      const gapX = isLR ? 64 : 26
      const gapY = isLR ? 22 : 52
      const pad = 20

      const pos = new Map<string, { x: number; y: number }>()
      let maxW = 0
      let maxH = 0

      sortedRanks.forEach((r, layerIdx) => {
        const group = layers.get(r) ?? []
        group.forEach((node, idxInLayer) => {
          const x = isLR
            ? pad + layerIdx * (nodeW + gapX)
            : pad + idxInLayer * (nodeW + gapX)
          const y = isLR
            ? pad + idxInLayer * (nodeH + gapY)
            : pad + layerIdx * (nodeH + gapY)
          pos.set(node.id, { x, y })
          maxW = Math.max(maxW, x + nodeW + pad)
          maxH = Math.max(maxH, y + nodeH + pad)
        })
      })

      return (
        <svg
          viewBox={`0 0 ${Math.max(300, maxW)} ${Math.max(110, maxH)}`}
          className="h-auto w-full min-w-[280px]"
        >
          <defs>
            <marker
              id="vz-flow-arrow"
              viewBox="0 0 10 10"
              refX="8"
              refY="5"
              markerWidth="6"
              markerHeight="6"
              orient="auto-start-reverse"
            >
              <path d="M 0 1 L 10 5 L 0 9 z" fill="#d4d4d4" />
            </marker>
          </defs>

          {parsed.edges.map((edge, idx) => {
            const p1 = pos.get(edge.from)
            const p2 = pos.get(edge.to)
            if (!p1 || !p2) return null
            const x1 = isLR ? p1.x + nodeW : p1.x + nodeW / 2
            const y1 = isLR ? p1.y + nodeH / 2 : p1.y + nodeH
            const x2 = isLR ? p2.x : p2.x + nodeW / 2
            const y2 = isLR ? p2.y + nodeH / 2 : p2.y
            const mx = (x1 + x2) / 2
            const my = (y1 + y2) / 2
            const pathD = isLR
              ? `M ${x1} ${y1} C ${mx} ${y1}, ${mx} ${y2}, ${x2 - 4} ${y2}`
              : `M ${x1} ${y1} C ${x1} ${my}, ${x2} ${my}, ${x2} ${y2 - 4}`

            return (
              <g key={idx}>
                <path
                  d={pathD}
                  fill="none"
                  stroke="#8c8c8c"
                  strokeWidth="1.4"
                  strokeDasharray={edge.dashed ? '4 3' : undefined}
                  markerEnd="url(#vz-flow-arrow)"
                />
                {edge.label && (
                  <g>
                    <rect
                      x={mx - Math.min(54, edge.label.length * 3.3 + 8)}
                      y={my - 9}
                      width={Math.min(108, edge.label.length * 6.6 + 16)}
                      height={16}
                      rx={4}
                      fill="#181818"
                      stroke="#353535"
                    />
                    <text
                      x={mx}
                      y={my + 2}
                      textAnchor="middle"
                      fill="#d4d4d4"
                      fontSize="9"
                      fontFamily="ui-sans-serif, system-ui, sans-serif"
                    >
                      {edge.label.slice(0, 18)}
                    </text>
                  </g>
                )}
              </g>
            )
          })}

          {parsed.nodes.map((node) => {
            const p = pos.get(node.id)
            if (!p) return null
            const cx = p.x + nodeW / 2
            const cy = p.y + nodeH / 2
            const shortLabel = node.label.length > 22 ? `${node.label.slice(0, 21)}…` : node.label

            return (
              <g key={node.id}>
                {node.shape === 'diamond' ? (
                  <polygon
                    points={`${cx},${p.y - 3} ${p.x + nodeW + 3},${cy} ${cx},${p.y + nodeH + 3} ${p.x - 3},${cy}`}
                    fill="#1f1f1f"
                    stroke="#666666"
                    strokeWidth="1.3"
                  />
                ) : (
                  <rect
                    x={p.x}
                    y={p.y}
                    width={nodeW}
                    height={nodeH}
                    rx={node.shape === 'round' || node.shape === 'circle' ? 20 : node.shape === 'db' ? 12 : 7}
                    fill="#1d1d1d"
                    stroke={node.shape === 'db' ? '#8c8c8c' : '#4a4a4a'}
                    strokeWidth="1.3"
                  />
                )}
                <text
                  x={cx}
                  y={cy + 3.5}
                  textAnchor="middle"
                  fill="#ffffff"
                  fontSize="10.5"
                  fontWeight="600"
                  fontFamily="ui-sans-serif, system-ui, sans-serif"
                >
                  {shortLabel}
                </text>
              </g>
            )
          })}
        </svg>
      )
    }

    return null
  }

  return (
    <div className="my-2 overflow-hidden rounded-lg border border-[#353535] bg-[#101010]">
      <div className="flex items-center justify-between border-b border-[#262626] bg-[#181818] px-2.5 py-1">
        <span className="flex items-center gap-1.5 font-mono text-[9.5px] uppercase tracking-wider text-[#cccccc]">
          <GitBranch size={11} className="text-white" />
          Diagram · Mermaid
        </span>
        <div className="flex items-center gap-1">
          {parsed.kind !== 'unsupported' && (
            <button
              type="button"
              onClick={() => setShowRaw((prev) => !prev)}
              className="rounded px-1.5 py-0.5 text-[9.5px] text-[#a3a3a3] transition hover:bg-[#2a2a2a] hover:text-white"
            >
              {showRaw ? 'Diagram' : 'Source'}
            </button>
          )}
          <button
            type="button"
            onClick={handleCopy}
            className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[9.5px] text-[#a3a3a3] transition hover:bg-[#2a2a2a] hover:text-white"
          >
            {copied ? <Check size={10} className="text-white" /> : <Copy size={10} />}
            {copied ? 'Copied' : 'Copy'}
          </button>
        </div>
      </div>
      {parsed.kind === 'unsupported' || showRaw ? (
        <pre className="overflow-x-auto p-2.5 font-mono text-[10.5px] leading-5 text-[#e5e5e5]">
          <code>{content}</code>
        </pre>
      ) : (
        <div className="overflow-x-auto bg-[radial-gradient(circle_at_center,#171717_0,#0e0e0e_80%)] p-3">
          {renderSvg()}
        </div>
      )}
    </div>
  )
}

function CalloutBlock({
  variant,
  lines,
}: {
  variant: 'note' | 'tip' | 'important' | 'warning' | 'caution' | 'quote'
  lines: string[]
}) {
  const meta = {
    note: { label: 'NOTE', border: 'border-l-[#9cdcfe]', text: 'text-[#9cdcfe]', Icon: Info },
    tip: { label: 'TIP', border: 'border-l-[#4ec9b0]', text: 'text-[#4ec9b0]', Icon: Lightbulb },
    important: {
      label: 'IMPORTANT',
      border: 'border-l-[#e5e5e5]',
      text: 'text-white',
      Icon: Sparkles,
    },
    warning: {
      label: 'WARNING',
      border: 'border-l-[#dcdcaa]',
      text: 'text-[#dcdcaa]',
      Icon: AlertTriangle,
    },
    caution: {
      label: 'CAUTION',
      border: 'border-l-[#f48771]',
      text: 'text-[#f48771]',
      Icon: ShieldAlert,
    },
    quote: { label: '', border: 'border-l-[#525252]', text: 'text-[#a3a3a3]', Icon: Info },
  }[variant]
  const Icon = meta.Icon

  return (
    <blockquote
      className={`my-2 rounded-r-md border border-[#2a2a2a] border-l-2 ${meta.border} bg-[#151515] px-3 py-2 text-[#cccccc]`}
    >
      {meta.label && (
        <div className={`mb-1 flex items-center gap-1 text-[9.5px] font-bold tracking-wider ${meta.text}`}>
          <Icon size={11} /> {meta.label}
        </div>
      )}
      <div className="space-y-1 leading-[1.6]">
        {lines.map((line, i) => (
          <p key={i}>
            <InlineContent text={line} />
          </p>
        ))}
      </div>
    </blockquote>
  )
}

export function MarkdownReply({
  text,
  compact = false,
  size,
}: {
  text: string
  compact?: boolean
  size?: 'compact' | 'normal' | 'large'
}) {
  const blocks = useMemo(() => parseMarkdownBlocks(text), [text])
  const effectiveSize = size ?? (compact ? 'compact' : 'normal')
  const isLarge = effectiveSize === 'large'
  const baseText = isLarge
    ? 'text-[14.5px] leading-[1.72]'
    : effectiveSize === 'compact'
      ? 'text-[10.5px] leading-[1.6]'
      : 'text-[11.5px] leading-[1.65]'

  return (
    <div className={`min-w-0 ${isLarge ? 'space-y-3' : 'space-y-2'} text-[#d4d4d4] ${baseText}`}>
      {blocks.map((block: MarkdownBlock, idx: number) => {
        if (block.type === 'hr') {
          return <hr key={idx} className="my-2.5 border-t border-[#2f2f2f]" />
        }

        if (block.type === 'heading') {
          if (block.level === 1) {
            return (
              <h1
                key={idx}
                className={`mt-2 border-b border-[#333333] pb-1.5 font-bold tracking-tight text-white ${
                  isLarge ? 'text-[20px]' : 'text-[14px]'
                }`}
              >
                <InlineContent text={block.text} />
              </h1>
            )
          }
          if (block.level === 2) {
            return (
              <h2
                key={idx}
                className={`mt-2.5 border-b border-[#282828] pb-1 font-bold text-white ${
                  isLarge ? 'text-[17px]' : 'text-[12.5px]'
                }`}
              >
                <InlineContent text={block.text} />
              </h2>
            )
          }
          if (block.level === 3) {
            return (
              <h3
                key={idx}
                className={`mt-2 font-semibold text-[#f5f5f5] ${
                  isLarge ? 'text-[15.5px]' : 'text-[11.5px]'
                }`}
              >
                <InlineContent text={block.text} />
              </h3>
            )
          }
          return (
            <h4
              key={idx}
              className={`mt-1.5 font-semibold uppercase tracking-wider text-[#cccccc] ${
                isLarge ? 'text-[13.5px]' : 'text-[10.5px]'
              }`}
            >
              <InlineContent text={block.text} />
            </h4>
          )
        }

        if (block.type === 'table') {
          return (
            <div
              key={idx}
              className="my-2 overflow-x-auto rounded-lg border border-[#333333] bg-[#141414]"
            >
              <table
                className={`w-full border-collapse text-left ${
                  isLarge ? 'text-[13.5px]' : 'text-[10.5px]'
                }`}
              >
                <thead>
                  <tr className="border-b border-[#333333] bg-[#202020]">
                    {block.headers.map((header, colIdx) => {
                      const align = block.alignments[colIdx] ?? 'left'
                      return (
                        <th
                          key={colIdx}
                          className={`${isLarge ? 'px-3.5 py-2.5' : 'px-2.5 py-1.5'} font-semibold text-white ${
                            align === 'center'
                              ? 'text-center'
                              : align === 'right'
                                ? 'text-right'
                                : 'text-left'
                          }`}
                        >
                          <InlineContent text={header} />
                        </th>
                      )
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-[#252525]">
                  {block.rows.map((row, rowIdx) => (
                    <tr key={rowIdx} className="transition hover:bg-[#1e1e1e] even:bg-[#171717]">
                      {block.headers.map((_, colIdx) => {
                        const align = block.alignments[colIdx] ?? 'left'
                        return (
                          <td
                            key={colIdx}
                            className={`${isLarge ? 'px-3.5 py-2.5' : 'px-2.5 py-1.5'} align-top text-[#d4d4d4] ${
                              align === 'center'
                                ? 'text-center'
                                : align === 'right'
                                  ? 'text-right'
                                  : 'text-left'
                            }`}
                          >
                            <InlineContent text={row[colIdx] ?? ''} />
                          </td>
                        )
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )
        }

        if (block.type === 'mermaid') {
          return <MermaidDiagramCard key={idx} content={block.content} />
        }

        if (block.type === 'code') {
          return (
            <CodeBlockCard
              key={idx}
              language={block.language}
              content={block.content}
              large={isLarge}
            />
          )
        }

        if (block.type === 'callout') {
          return <CalloutBlock key={idx} variant={block.variant} lines={block.lines} />
        }

        if (block.type === 'list') {
          const Tag = block.ordered ? 'ol' : 'ul'
          return (
            <Tag
              key={idx}
              className={`space-y-1 pl-4 ${
                block.ordered ? 'list-decimal marker:text-[#8f8f8f]' : 'list-disc marker:text-[#737373]'
              }`}
            >
              {block.items.map((item, itemIdx) => (
                <li
                  key={itemIdx}
                  style={item.indent > 0 ? { marginLeft: `${item.indent * 12}px` } : undefined}
                  className={item.checked !== undefined ? 'list-none -ml-3 flex items-start gap-1.5' : ''}
                >
                  {item.checked !== undefined && (
                    <span
                      className={`mt-0.5 grid size-3.5 shrink-0 place-items-center rounded border text-[9px] ${
                        item.checked
                          ? 'border-[#e5e5e5] bg-[#e5e5e5] text-[#111111]'
                          : 'border-[#525252] bg-[#141414] text-transparent'
                      }`}
                    >
                      <Check size={9} />
                    </span>
                  )}
                  <span>
                    <InlineContent text={item.text} />
                  </span>
                </li>
              ))}
            </Tag>
          )
        }

        return (
          <p key={idx} className="whitespace-pre-line">
            <InlineContent text={block.text} />
          </p>
        )
      })}
    </div>
  )
}
