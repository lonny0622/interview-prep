import type { IncomingMessage, ServerResponse } from 'node:http'
import { isIP } from 'node:net'

const SAFE_METHODS = new Set(['GET', 'HEAD', 'OPTIONS'])

export function applySecurityHeaders(response: ServerResponse, production: boolean): void {
  response.setHeader('Content-Security-Policy', [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self'",
    "img-src 'self' data: blob:",
    "media-src 'self' blob:",
    "connect-src 'self'",
    "font-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    ...(production ? ['upgrade-insecure-requests'] : []),
  ].join('; '))
  response.setHeader('Cross-Origin-Opener-Policy', 'same-origin')
  response.setHeader('Cross-Origin-Resource-Policy', 'same-origin')
  response.setHeader('Permissions-Policy', 'camera=(), geolocation=(), payment=(), usb=()')
  response.setHeader('Referrer-Policy', 'no-referrer')
  response.setHeader('X-Content-Type-Options', 'nosniff')
  response.setHeader('X-Frame-Options', 'DENY')
  if (production) response.setHeader('Strict-Transport-Security', 'max-age=31536000')
}

export function requestClientAddress(request: IncomingMessage, trustProxy: boolean): string {
  if (trustProxy) {
    const forwarded = request.headers['x-forwarded-for']
    const value = Array.isArray(forwarded) ? forwarded[0] : forwarded
    // Coolify's edge proxy appends the actual peer to the right. Taking the last
    // valid address prevents a client-prepended value from bypassing rate limits.
    const addresses = value?.split(',').map((item) => item.trim()).filter((item) => isIP(item))
    const nearest = addresses?.at(-1)
    if (nearest) return nearest
  }
  return request.socket.remoteAddress || 'unknown'
}

export function isRequestOriginAllowed(request: IncomingMessage, configuredOrigin: string): boolean {
  if (SAFE_METHODS.has(request.method || '')) return true
  const suppliedOrigin = request.headers.origin
  if (!suppliedOrigin || Array.isArray(suppliedOrigin)) return false
  if (configuredOrigin) return suppliedOrigin === configuredOrigin

  const host = request.headers.host
  if (!host) return false
  const protocol = 'encrypted' in request.socket && request.socket.encrypted ? 'https' : 'http'
  return suppliedOrigin === `${protocol}://${host}`
}
