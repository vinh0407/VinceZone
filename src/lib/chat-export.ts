import type { Agent } from '@/components/ide/agent-types'

/**
 * Exports an agent's conversation history into a clean, readable Markdown transcript.
 */
export function exportAgentChatToMarkdown(agent: Agent, projectName: string): string {
  const lines: string[] = [
    `# VinceZone Studio Transcript — ${agent.name}`,
    '',
    `- **Project:** ${projectName}`,
    `- **Role:** ${agent.role}${agent.roleId ? ` (@${agent.roleId.toUpperCase()})` : ''}`,
    `- **Model:** ${agent.model}`,
    `- **Exported At:** ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ]

  for (const msg of agent.messages) {
    const label =
      msg.role === 'user'
        ? '## User'
        : msg.role === 'assistant'
          ? `## ${agent.name}`
          : msg.role === 'agent'
            ? `## Agent Handoff (${msg.from || 'Teammate'})`
            : '### Tool / Runtime Note'
    lines.push(label)
    if (msg.sentAt) {
      lines.push(`*${msg.sentAt}*`)
    }
    lines.push('')
    if (msg.text?.trim()) {
      lines.push(msg.text.trim())
    }
    if (msg.codeSnippet?.trim()) {
      lines.push('')
      lines.push('```')
      lines.push(msg.codeSnippet.trim())
      lines.push('```')
    }
    if (msg.images && msg.images.length > 0) {
      lines.push('')
      lines.push(`*(Attached ${msg.images.length} image(s): ${msg.images.map((i) => i.name).join(', ')})*`)
    }
    lines.push('')
    lines.push('---')
    lines.push('')
  }

  return lines.join('\n')
}
