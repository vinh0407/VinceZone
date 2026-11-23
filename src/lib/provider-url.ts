import { lookup } from 'node:dns/promises'
import { isIP } from 'node:net'

type DnsLookupFn = (hostname: string) => Promise<Array<{ address: string; family: number }>>

const defaultLookup: DnsLookupFn = async (hostname) => {
  const records = await lookup(hostname, { all: true, verbatim: true })
  return records
}

function normalizeHost(hostname: string) {
  return hostname.replace(/^\[|\]$/g, '').toLowerCase()
}

function isPrivateIPv4Octets(octets: number[]) {
  if (
    octets.length !== 4 ||
    octets.some((octet) => Number.isNaN(octet) || octet < 0 || octet > 255)
  ) {
    return true
  }
  const [a, b] = octets
  return (
    a === 0 || // 0.0.0.0/8
    a === 10 || // 10.0.0.0/8
    a === 127 || // 127.0.0.0/8 loopback
    (a === 100 && b >= 64 && b <= 127) || // 100.64.0.0/10 CGNAT
    (a === 169 && b === 254) || // 169.254.0.0/16 link-local / cloud metadata
    (a === 172 && b >= 16 && b <= 31) || // 172.16.0.0/12
    (a === 192 && b === 168) || // 192.168.0.0/16
    (a === 198 && (b === 18 || b === 19)) || // 198.18.0.0/15 benchmark
    a >= 224 // multicast & reserved
  )
}

function extractMappedIPv4(ipv6: string): number[] | null {
  const lower = ipv6.toLowerCase()
  const mappedPrefix = '::ffff:'
  if (!lower.startsWith(mappedPrefix)) return null

  const tail = lower.slice(mappedPrefix.length)
  if (isIP(tail) === 4) {
    return tail.split('.').map(Number)
  }

  // Handle compressed hex form like ::ffff:7f00:1 or ::ffff:a9fe:a9fe
  const hexParts = tail.split(':')
  if (hexParts.length === 2 && hexParts.every((part) => /^[0-9a-f]{1,4}$/.test(part))) {
    const hi = parseInt(hexParts[0], 16)
    const lo = parseInt(hexParts[1], 16)
    return [(hi >> 8) & 0xff, hi & 0xff, (lo >> 8) & 0xff, lo & 0xff]
  }

  return null
}

export function isPrivateIpAddress(address: string): boolean {
  const clean = normalizeHost(address).split('%')[0]
  const ipVersion = isIP(clean)

  if (ipVersion === 4) {
    return isPrivateIPv4Octets(clean.split('.').map(Number))
  }

  if (ipVersion === 6) {
    if (clean === '::' || clean === '::1') return true
    const mapped = extractMappedIPv4(clean)
    if (mapped) return isPrivateIPv4Octets(mapped)

    const firstGroup = clean.split(':')[0] || ''
    // fc00::/7 (ULA), fe80::/10 (link-local), ff00::/8 (multicast)
    if (
      firstGroup.startsWith('fc') ||
      firstGroup.startsWith('fd') ||
      /^fe[89ab]/.test(firstGroup) ||
      firstGroup.startsWith('ff')
    ) {
      return true
    }
    return false
  }

  return false
}

export function isPrivateHost(hostname: string): boolean {
  const host = normalizeHost(hostname)
  if (
    !host ||
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host.endsWith('.local') ||
    host.endsWith('.internal') ||
    host === 'metadata.google.internal'
  ) {
    return true
  }

  if (isIP(host) !== 0) {
    return isPrivateIpAddress(host)
  }

  // Block raw integer/octal/hex IPv4 obfuscation (e.g., 2130706433 or 0x7f000001)
  if (/^(0x[0-9a-f]+|\d+)$/i.test(host)) {
    return true
  }

  return false
}

export function parseProviderEndpoint(baseUrl: string): URL {
  let url: URL
  try {
    url = new URL(baseUrl)
  } catch {
    throw new Error('Invalid provider URL.')
  }

  if (url.protocol !== 'https:' || url.username || url.password || isPrivateHost(url.hostname)) {
    throw new Error('Endpoint must be a public HTTPS URL.')
  }

  if (!url.pathname.endsWith('/chat/completions')) {
    url.pathname = `${url.pathname.replace(/\/$/, '')}/chat/completions`
  }

  return url
}

export async function resolveSafeProviderEndpoint(
  baseUrl: string,
  dnsLookup: DnsLookupFn = defaultLookup,
): Promise<URL> {
  const url = parseProviderEndpoint(baseUrl)
  const host = normalizeHost(url.hostname)

  if (isIP(host) !== 0) {
    if (isPrivateIpAddress(host)) {
      throw new Error('Endpoint must be a public HTTPS URL.')
    }
    return url
  }

  let addresses: Array<{ address: string; family: number }>
  try {
    addresses = await dnsLookup(host)
  } catch {
    throw new Error('Could not resolve provider hostname.')
  }

  if (!addresses.length || addresses.some((record) => isPrivateIpAddress(record.address))) {
    throw new Error('Provider hostname resolves to a private or disallowed address.')
  }

  return url
}
