import path from 'node:path'
import { describe, expect, it } from 'vitest'
import { isLoopbackRequest, resolvePathInsideWorkspace } from '@/lib/local-guard'

describe('local-guard desktop security', () => {
  it('allows only loopback requests', () => {
    const localReq = new Request('http://localhost:40704/api/workspace', {
      headers: { host: 'localhost:40704' },
    })
    expect(isLoopbackRequest(localReq)).toBe(true)

    const remoteReq = new Request('https://evil.example.com/api/workspace', {
      headers: { host: 'evil.example.com' },
    })
    expect(isLoopbackRequest(remoteReq)).toBe(false)

    const proxiedReq = new Request('http://127.0.0.1:40704/api/workspace', {
      headers: { host: '127.0.0.1:40704', 'x-forwarded-for': '203.0.113.5' },
    })
    expect(isLoopbackRequest(proxiedReq)).toBe(false)
  })

  it('prevents directory traversal outside workspace root', () => {
    const root = path.resolve(process.cwd())
    const ok = resolvePathInsideWorkspace(root, 'src/app/page.tsx')
    expect(ok.startsWith(root)).toBe(true)
    expect(() => resolvePathInsideWorkspace(root, '../../Windows/win.ini')).toThrow()
  })
})
