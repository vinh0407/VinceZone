/**
 * Automatic Conversation Compactor (Auto-Compact) for long multi-turn AI Agent chats.
 * Preserves the user's opening goals, middle-session architectural/technical anchors
 * (file paths, root causes, decisions, commands), tool edits, and recent turns
 * when history exceeds `maxRecent`, preventing silent context loss on 30-40+ turn sessions.
 */

export type CompactableMessage = {
  id?: string
  role: 'user' | 'assistant' | 'tool' | 'agent'
  text: string
  from?: string
  images?: Array<{ id: string; name: string; mimeType: string; dataUrl: string }>
}

export type OutgoingApiMessage = {
  role: 'system' | 'user' | 'assistant'
  content:
    | string
    | Array<
        | { type: 'text'; text: string }
        | { type: 'image_url'; image_url: { url: string } }
      >
}

const TECHNICAL_ANCHOR_RE =
  /(?:[a-z0-9_-]+\/[a-z0-9_.-]+\.[a-z]{1,5}\b|decision|decided|fixed|root cause|architecture|schema|migration|error:|failed|passed|pnpm |git |api\/)/i

export function buildCompactedHistory(
  messages: CompactableMessage[],
  maxRecent = 14,
): {
  apiMessages: OutgoingApiMessage[]
  compactedCount: number
  summaryBlock: string
} {
  const nonTool = messages.filter((m) => m.role !== 'tool')
  const recent = nonTool.slice(-maxRecent)
  const earlier = nonTool.slice(0, Math.max(0, nonTool.length - maxRecent))

  const toApiMessage = (m: CompactableMessage): OutgoingApiMessage => {
    const role: 'user' | 'assistant' = m.role === 'agent' ? 'user' : (m.role as 'user' | 'assistant')
    const baseText =
      m.role === 'agent' ? `Delegated by ${m.from ?? 'teammate'}: ${m.text}` : m.text

    if (role === 'user' && m.images && m.images.length > 0) {
      return {
        role: 'user',
        content: [
          { type: 'text', text: baseText || 'Analyze the attached image(s).' },
          ...m.images.slice(0, 4).map((img) => ({
            type: 'image_url' as const,
            image_url: { url: img.dataUrl },
          })),
        ],
      }
    }
    return { role, content: baseText }
  }

  if (earlier.length === 0) {
    return {
      apiMessages: recent.map(toApiMessage),
      compactedCount: 0,
      summaryBlock: '',
    }
  }

  // 1. Opening user goals
  const userMessages = earlier.filter((m) => m.role === 'user' && m.text.trim())
  const openingGoals = userMessages
    .slice(0, 4)
    .map((m) => `- User asked: ${m.text.replace(/\s+/g, ' ').trim().slice(0, 200)}`)

  // 2. Middle-session architectural/technical anchors (turns between opening & tail)
  const middleSlice = earlier.slice(4, Math.max(4, earlier.length - 4))
  const middleAnchors = middleSlice
    .filter((m) => TECHNICAL_ANCHOR_RE.test(m.text))
    .slice(-8)
    .map(
      (m) =>
        `- [${m.role === 'assistant' ? 'Decision' : 'Context'}] ${m.text.replace(/\s+/g, ' ').trim().slice(0, 200)}`,
    )

  // 3. Most recent earlier assistant conclusions
  const assistantDecisions = earlier
    .filter((m) => m.role === 'assistant' && m.text.trim())
    .slice(-4)
    .map((m) => `- Assistant concluded: ${m.text.replace(/\s+/g, ' ').trim().slice(0, 220)}`)

  // 4. Completed workspace actions & referenced file paths
  const toolEdits = messages
    .slice(0, Math.max(0, messages.length - maxRecent))
    .filter((m) => m.role === 'tool' && /Edited & saved|approved command|Restored/i.test(m.text))
    .slice(-10)
    .map((m) => `- ${m.text.replace(/\s+/g, ' ').trim().slice(0, 180)}`)

  const summaryBlock = [
    `[AUTO-COMPACTED EARLIER CONVERSATION (${earlier.length} older messages condensed to preserve context window)]`,
    openingGoals.length ? `Earlier Goals:\n${openingGoals.join('\n')}` : '',
    middleAnchors.length ? `Key Mid-Session Decisions & Technical Anchors:\n${middleAnchors.join('\n')}` : '',
    toolEdits.length ? `Completed Workspace Actions:\n${toolEdits.join('\n')}` : '',
    assistantDecisions.length ? `Latest Earlier Conclusions:\n${assistantDecisions.join('\n')}` : '',
  ]
    .filter(Boolean)
    .join('\n\n')
    .slice(0, 3_600)

  const apiMessages: OutgoingApiMessage[] = [
    { role: 'system', content: summaryBlock },
    ...recent.map(toApiMessage),
  ]

  return {
    apiMessages,
    compactedCount: earlier.length,
    summaryBlock,
  }
}
