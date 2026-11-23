type RateLimitEntry = {
  timestamps: number[]
}

const buckets = new Map<string, RateLimitEntry>()
const MAX_BUCKETS = 2000

export type RateLimitResult = {
  allowed: boolean
  remaining: number
  retryAfterSeconds: number
}

export function getClientKey(request: Request, scope: string): string {
  const forwarded = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  const realIp = request.headers.get('x-real-ip')?.trim()
  const ip = forwarded || realIp || 'local'
  return `${scope}:${ip}`
}

export function checkRateLimit(
  key: string,
  options: { limit: number; windowMs: number },
  now = Date.now(),
): RateLimitResult {
  const cutoff = now - options.windowMs
  const existing = buckets.get(key)
  const recent = existing ? existing.timestamps.filter((ts) => ts > cutoff) : []

  if (recent.length >= options.limit) {
    const oldest = recent[0] ?? now
    const retryAfterMs = Math.max(1000, oldest + options.windowMs - now)
    buckets.set(key, { timestamps: recent })
    return {
      allowed: false,
      remaining: 0,
      retryAfterSeconds: Math.ceil(retryAfterMs / 1000),
    }
  }

  recent.push(now)
  buckets.set(key, { timestamps: recent })

  if (buckets.size > MAX_BUCKETS) {
    for (const [bucketKey, entry] of buckets) {
      if (entry.timestamps.every((ts) => ts <= cutoff)) {
        buckets.delete(bucketKey)
      }
      if (buckets.size <= MAX_BUCKETS / 2) break
    }
  }

  return {
    allowed: true,
    remaining: Math.max(0, options.limit - recent.length),
    retryAfterSeconds: 0,
  }
}

export function resetRateLimitsForTests() {
  buckets.clear()
}
