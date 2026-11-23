import { describe, expect, it } from 'vitest'
import {
  isPrivateHost,
  isPrivateIpAddress,
  parseProviderEndpoint,
  resolveSafeProviderEndpoint,
} from '@/lib/provider-url'

describe('provider-url SSRF protection', () => {
  it('detects private IPv4, CGNAT, metadata, IPv6, and IPv4-mapped IPv6 addresses', () => {
    expect(isPrivateIpAddress('127.0.0.1')).toBe(true)
    expect(isPrivateIpAddress('10.0.0.5')).toBe(true)
    expect(isPrivateIpAddress('172.16.0.1')).toBe(true)
    expect(isPrivateIpAddress('192.168.1.10')).toBe(true)
    expect(isPrivateIpAddress('169.254.169.254')).toBe(true)
    expect(isPrivateIpAddress('100.64.0.1')).toBe(true)
    expect(isPrivateIpAddress('0.0.0.0')).toBe(true)
    expect(isPrivateIpAddress('::1')).toBe(true)
    expect(isPrivateIpAddress('fc00::1')).toBe(true)
    expect(isPrivateIpAddress('fe80::1')).toBe(true)
    expect(isPrivateIpAddress('::ffff:127.0.0.1')).toBe(true)
    expect(isPrivateIpAddress('::ffff:169.254.169.254')).toBe(true)
    expect(isPrivateIpAddress('::ffff:7f00:1')).toBe(true)
    expect(isPrivateIpAddress('::ffff:a9fe:a9fe')).toBe(true)

    expect(isPrivateIpAddress('8.8.8.8')).toBe(false)
    expect(isPrivateIpAddress('1.1.1.1')).toBe(false)
    expect(isPrivateIpAddress('2606:4700:4700::1111')).toBe(false)
    expect(isPrivateIpAddress('::ffff:8.8.8.8')).toBe(false)
  })

  it('rejects non-HTTPS, credentials, local domains, and obfuscated numeric hosts', () => {
    expect(() => parseProviderEndpoint('http://api.openai.com/v1')).toThrow()
    expect(() => parseProviderEndpoint('https://user:pass@api.openai.com/v1')).toThrow()
    expect(() => parseProviderEndpoint('https://localhost/v1')).toThrow()
    expect(() => parseProviderEndpoint('https://foo.localhost/v1')).toThrow()
    expect(() => parseProviderEndpoint('https://metadata.google.internal/v1')).toThrow()
    expect(() => parseProviderEndpoint('https://[::ffff:127.0.0.1]/v1')).toThrow()
    expect(isPrivateHost('2130706433')).toBe(true)
    expect(isPrivateHost('0x7f000001')).toBe(true)
  })

  it('normalizes /chat/completions path for public endpoints', () => {
    const url = parseProviderEndpoint('https://api.omnirouter.ai/v1/')
    expect(url.toString()).toBe('https://api.omnirouter.ai/v1/chat/completions')

    const already = parseProviderEndpoint('https://api.omnirouter.ai/v1/chat/completions')
    expect(already.toString()).toBe('https://api.omnirouter.ai/v1/chat/completions')
  })

  it('blocks hostnames resolving to private IPs via DNS lookup', async () => {
    await expect(
      resolveSafeProviderEndpoint('https://rebind.example.com/v1', async () => [
        { address: '169.254.169.254', family: 4 },
      ]),
    ).rejects.toThrow(/private/i)

    await expect(
      resolveSafeProviderEndpoint('https://dual.example.com/v1', async () => [
        { address: '104.21.1.1', family: 4 },
        { address: '::ffff:127.0.0.1', family: 6 },
      ]),
    ).rejects.toThrow(/private/i)

    const ok = await resolveSafeProviderEndpoint('https://api.omnirouter.ai/v1', async () => [
      { address: '104.21.1.1', family: 4 },
    ])
    expect(ok.hostname).toBe('api.omnirouter.ai')
  })

  it('allows explicit local loopback gateways like OmniRoute when allowLocalLoopback is enabled while still blocking LAN/metadata', async () => {
    const localOmni = await resolveSafeProviderEndpoint(
      'http://localhost:20128/v1',
      undefined,
      { allowLocalLoopback: true },
    )
    expect(localOmni.toString()).toBe('http://localhost:20128/v1/chat/completions')

    await expect(
      resolveSafeProviderEndpoint('http://169.254.169.254/latest/meta-data', undefined, {
        allowLocalLoopback: true,
      }),
    ).rejects.toThrow()

    await expect(
      resolveSafeProviderEndpoint('http://10.0.0.5:8000/v1', undefined, {
        allowLocalLoopback: true,
      }),
    ).rejects.toThrow()
  })
})
