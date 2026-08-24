export type AttemptBucket = {
  attempts: number
  window_started_at: number
  blocked_until: number
}

export type AttemptStore = {
  get: (key: string) => AttemptBucket | undefined
  set: (key: string, bucket: AttemptBucket, now: number) => void
  delete: (key: string) => void
  prune: (now: number, maxAgeMs: number) => void
}

class MemoryAttemptStore implements AttemptStore {
  private readonly buckets = new Map<string, AttemptBucket>()
  get(key: string) { return this.buckets.get(key) }
  set(key: string, bucket: AttemptBucket) { this.buckets.set(key, bucket) }
  delete(key: string) { this.buckets.delete(key) }
  prune(now: number, maxAgeMs: number) {
    for (const [key, bucket] of this.buckets) if (bucket.blocked_until <= now && bucket.window_started_at < now - maxAgeMs) this.buckets.delete(key)
    while (this.buckets.size > 1_000) {
      const oldest = this.buckets.keys().next().value
      if (typeof oldest !== 'string') break
      this.buckets.delete(oldest)
    }
  }
}

export type AttemptDecision = {
  allowed: boolean
  retryAfterSeconds: number
}

/** Login limiter backed by a pluggable store; production uses SQLite persistence. */
export class LoginAttemptLimiter {
  constructor(
    private readonly maxAttempts: number,
    private readonly windowMs: number,
    private readonly lockoutMs: number,
    private readonly store: AttemptStore = new MemoryAttemptStore(),
  ) {}

  consume(key: string, now = Date.now()): AttemptDecision {
    const existing = this.store.get(key)
    const bucket = !existing || now - existing.window_started_at >= this.windowMs
      ? { attempts: 0, window_started_at: now, blocked_until: 0 }
      : existing

    if (bucket.blocked_until > now) {
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil((bucket.blocked_until - now) / 1_000)) }
    }

    bucket.attempts += 1
    if (bucket.attempts > this.maxAttempts) {
      bucket.blocked_until = now + this.lockoutMs
      this.store.set(key, bucket, now)
      return { allowed: false, retryAfterSeconds: Math.max(1, Math.ceil(this.lockoutMs / 1_000)) }
    }

    this.store.set(key, bucket, now)
    this.store.prune(now, Math.max(this.windowMs, this.lockoutMs) * 2)
    return { allowed: true, retryAfterSeconds: 0 }
  }

  reset(key: string): void {
    this.store.delete(key)
  }
}
