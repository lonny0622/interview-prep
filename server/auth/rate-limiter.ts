type AttemptBucket = {
  attempts: number
  windowStartedAt: number
  blockedUntil: number
}

export type AttemptDecision = {
  allowed: boolean
  retryAfterSeconds: number
}

/** Small in-memory limiter intended for the single-instance personal deployment. */
export class LoginAttemptLimiter {
  private readonly buckets = new Map<string, AttemptBucket>()

  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly lockoutMs: number,
  ) {}

  consume(key: string, now = Date.now()): AttemptDecision {
    const existing = this.buckets.get(key)
    const bucket = !existing || now - existing.windowStartedAt >= this.windowMs
      ? { attempts: 0, windowStartedAt: now, blockedUntil: 0 }
      : existing

    if (bucket.blockedUntil > now) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.blockedUntil - now) / 1_000)) }
    }

    bucket.attempts += 1
    if (bucket.attempts > this.maxAttempts) {
      bucket.blockedUntil = now + this.lockoutMs
      this.buckets.set(key, bucket)
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(this.lockoutMs / 1_000)) }
    }

    this.buckets.set(key, bucket)
    this.prune(now)
    return { allowed: true, retryAfterSeconds: 0 }
  }

  reset(key: string): void {
    this.buckets.delete(key)
  }

  private prune(now: number): void {
    if (this.buckets.size < 1_000) return
    for (const [key, bucket] of this.buckets) {
      if (bucket.blockedUntil <= now && now - bucket.windowStartedAt >= this.windowMs) this.buckets.delete(key)
    }
    while (this.buckets.size > 1_000) {
      const oldest = this.buckets.keys().next().value as string | undefined
      if (!oldest) break
      this.buckets.delete(oldest)
    }
  }
}
