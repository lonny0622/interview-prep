import { createReadStream, existsSync, statSync } from 'node:fs'
import type { IncomingMessage, ServerResponse } from 'node:http'
import { extname, resolve, sep } from 'node:path'

const CONTENT_TYPES: Record<string, string> = {
  '.css': 'text/css; charset=utf-8',
  '.html': 'text/html; charset=utf-8',
  '.ico': 'image/x-icon',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.map': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.svg': 'image/svg+xml',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
}

export function serveStaticApp(request: IncomingMessage, response: ServerResponse, rootDir: string): boolean {
  if (request.method !== 'GET' && request.method !== 'HEAD') return false
  const staticRoot = resolve(rootDir, 'dist')
  let pathname: string
  try {
    pathname = decodeURIComponent((request.url || '/').split('?')[0])
  } catch {
    return false
  }

  const requested = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '')
  let filePath = resolve(staticRoot, requested)
  if (filePath !== staticRoot && !filePath.startsWith(`${staticRoot}${sep}`)) return false
  if (!existsSync(filePath) || !statSync(filePath).isFile()) filePath = resolve(staticRoot, 'index.html')
  if (!existsSync(filePath)) return false

  const isIndex = filePath.endsWith(`${sep}index.html`)
  const isHashedAsset = filePath.includes(`${sep}assets${sep}`)
  response.writeHead(200, {
    'Content-Type': CONTENT_TYPES[extname(filePath)] || 'application/octet-stream',
    'Cache-Control': isIndex ? 'no-cache' : isHashedAsset ? 'public, max-age=31536000, immutable' : 'public, max-age=3600',
  })
  if (request.method === 'HEAD') response.end()
  else createReadStream(filePath).pipe(response)
  return true
}
