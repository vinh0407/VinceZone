import { beforeEach, describe, expect, it } from 'vitest'
import { checkRateLimit, resetRateLimitsForTests } from '@/lib/rate-limit'

describe('rate-limit', () => {
  beforeEach(() => {
    resetRateLimitsForTests()
  })

  it('enforces sliding window limits and recovers after window expires', () => {
    const start = 10_000
    expect(checkRateLimit('chat:1.2.3.4', { limit: 2, windowMs: 1000 }, start).allowed).toBe(true)
    expect(checkRateLimit('chat:1.2.3.4', { limit: 2, windowMs: 1000 }, start + 200).allowed).toBe(
      true,
    )

    const blocked = checkRateLimit('chat:1.2.3.4', { limit: 2, windowMs: 1000 }, start + 300)
    expect(blocked.allowed).toBe(false)
    expect(blocked.retryAfterSeconds).toBeGreaterThanOrEqual(1)

    const recovered = checkRateLimit('chat:1.2.3.4', { limit: 2, windowMs: 1000 }, start + 1100)
    expect(recovered.allowed).toBe(true)
  })
})
