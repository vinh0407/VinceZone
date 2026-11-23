import { describe, expect, it } from 'vitest'
import { probeCompanionEndpoint } from '@/lib/companion/client'
import { COMPANION_PROTOCOL_VERSION } from '@/lib/companion/protocol'

describe('companion client probe', () => {
  it('blocks non-loopback companion endpoints', async () => {
    const result = await probeCompanionEndpoint('https://evil.example.com')
    expect(result.state).toBe('error')
    expect(result.notice).toMatch(/loopback/i)
  })

  it('connects cleanly to a valid loopback companion handshake', async () => {
    const result = await probeCompanionEndpoint(
      'http://127.0.0.1:4173',
      async () =>
        new Response(
          JSON.stringify({
            version: COMPANION_PROTOCOL_VERSION,
            companionId: 'local-dev-01',
            hostname: 'devbox',
            platform: 'win32',
            capabilities: ['fs.read', 'pty.spawn', 'cli.claude'],
            state: 'paired',
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        ),
    )

    expect(result.state).toBe('paired')
    expect(result.capabilities).toContain('cli.claude')
    expect(result.endpoint).toBe('http://127.0.0.1:4173')
  })
})
