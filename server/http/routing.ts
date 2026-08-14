import type { IncomingMessage } from 'node:http'

export type RoutePattern = string | RegExp

/** 返回不含查询参数的请求路径。 */
export function requestPath(request: IncomingMessage): string {
  return request.url?.split('?')[0] || ''
}

/** 同时匹配 HTTP method 和静态/正则路径。 */
export function matchesRoute(request: IncomingMessage, method: string, pattern: RoutePattern): boolean {
  if (request.method !== method) return false
  const path = requestPath(request)
  return typeof pattern === 'string' ? path === pattern : pattern.test(path)
}

export function pathSegment(request: IncomingMessage, index: number): string {
  return requestPath(request).split('/')[index] || ''
}

export function lastPathSegment(request: IncomingMessage): string {
  return requestPath(request).split('/').pop() || ''
}
