import { describe, expect, it } from 'vitest'
import { tokenizeChatHighlights } from '@/components/ide/highlighted-chat-input'

describe('Chat skill & context highlighting tokenizer', () => {
  it('highlights /skill, /combo, /mcp, /plugin and @context tokens accurately', () => {
    const tokens = tokenizeChatHighlights(
      '/playwright-cli kiểm tra @FE với /combo:combo-01-token-saver và @folder:src/lib',
    )
    expect(tokens.filter((t) => t.kind === 'slash').map((t) => t.text)).toEqual([
      '/playwright-cli',
      '/combo:combo-01-token-saver',
    ])
    expect(tokens.filter((t) => t.kind === 'mention').map((t) => t.text)).toEqual([
      '@FE',
      '@folder:src/lib',
    ])
  })

  it('does not falsely highlight mid-URL slashes inside plain URLs', () => {
    const tokens = tokenizeChatHighlights('Open @browser:https://example.com/docs and /vitest')
    expect(tokens.filter((t) => t.kind === 'slash').map((t) => t.text)).toEqual(['/vitest'])
    expect(tokens.filter((t) => t.kind === 'mention').map((t) => t.text)).toEqual([
      '@browser:https://example.com/docs',
    ])
  })
})
