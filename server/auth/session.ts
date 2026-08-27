import { createHmac, timingSafeEqual } from 'node:crypto'

export type SessionPayload = {
  sub: string
  sid: string
  iat: number
  exp: number
  version: string
}

function signature(value: string, secret: string): string {
  return createHmac('sha256', secret).update(value).digest('base64url')
}

function sessionVersion(passwordHash: string): string {
  return createHmac('sha256', passwordHash).update('interviewprep-session-version').digest('base64url').slice(0, 22)
}

export function createSessionToken(username: string, sessionId: string, passwordHash: string, secret: string, ttlSeconds: number, now = Date.now()): string {
  const issuedAt = Math.floor(now / 1_000)
  const payload: SessionPayload = {
    sub: username,
    sid: sessionId,
    iat: issuedAt,
    exp: issuedAt + ttlSeconds,
    version: sessionVersion(passwordHash),
  }
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64url')
  return `${encoded}.${signature(encoded, secret)}`
}

export function verifySessionToken(token: string, username: string, passwordHash: string, secret: string, now = Date.now()): SessionPayload | null {
  const [encoded, suppliedSignature, extra] = token.split('.')
  if (!encoded || !suppliedSignature || extra) return null
  const expectedSignature = signature(encoded, secret)
  const supplied = Buffer.from(suppliedSignature)
  const expected = Buffer.from(expectedSignature)
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) return null

  try {
    const payload = JSON.parse(Buffer.from(encoded, 'base64url').toString('utf8')) as Partial<SessionPayload>
    const nowSeconds = Math.floor(now / 1_000)
    if (payload.sub !== username || typeof payload.sid !== 'string' || payload.sid.length < 20 || payload.version !== sessionVersion(passwordHash)) return null
    if (!Number.isInteger(payload.iat) || !Number.isInteger(payload.exp)) return null
    if ((payload.iat as number) > nowSeconds + 60 || (payload.exp as number) <= nowSeconds) return null
    return payload as SessionPayload
  } catch {
    return null
  }
}

export function parseCookies(cookieHeader = ''): Record<string, string> {
  return Object.fromEntries(cookieHeader.split(';').flatMap((part) => {
    const separator = part.indexOf('=')
    if (separator < 1) return []
    const name = part.slice(0, separator).trim()
    const value = part.slice(separator + 1).trim()
    try {
      return [[name, decodeURIComponent(value)]]
    } catch {
      return []
    }
  }))
}

export function sessionCookieName(secure: boolean): string {
  return secure ? '__Host-interviewprep_session' : 'interviewprep_session'
}

export function sessionCookie(token: string, maxAge: number, secure: boolean): string {
  const secureAttribute = secure ? '; Secure' : ''
  const normalizedMaxAge = Math.max(0, Math.floor(maxAge))
  const expires = new Date(Date.now() + normalizedMaxAge * 1_000).toUTCString()
  return `${sessionCookieName(secure)}=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${normalizedMaxAge}; Expires=${expires}${secureAttribute}`
}
