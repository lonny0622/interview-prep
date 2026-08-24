import type { IncomingMessage } from 'node:http'

export async function readJson<T>(request: IncomingMessage, limit = 1_000_000): Promise<T> {
  const raw = await readBody(request, limit)
  try {
    return JSON.parse(raw) as T
  } catch {
    throw new Error('请求体必须是合法 JSON。')
  }
}

export function readBody(request: IncomingMessage, limit = 1_000_000): Promise<string> {
  return new Promise((resolve, reject) => {
    const declaredLength = Number(request.headers['content-length'] || 0)
    if (Number.isFinite(declaredLength) && declaredLength > limit) {
      request.resume()
      reject(new Error(`请求内容超过 ${formatLimit(limit)} 限制。`))
      return
    }

    const chunks: Buffer[] = []
    let received = 0
    let settled = false

    const cleanup = () => {
      request.off('data', onData)
      request.off('end', onEnd)
      request.off('error', onError)
      request.off('aborted', onAborted)
    }
    const fail = (error: Error, drain = false) => {
      if (settled) return
      settled = true
      cleanup()
      if (drain) {
        request.on('error', () => {})
        request.resume()
      }
      reject(error)
    }
    const onData = (chunk: Buffer | string) => {
      const binary = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      received += binary.length
      if (received > limit) {
        fail(new Error(`请求内容超过 ${formatLimit(limit)} 限制。`), true)
        return
      }
      chunks.push(binary)
    }
    const onEnd = () => {
      if (settled) return
      settled = true
      cleanup()
      resolve(Buffer.concat(chunks, received).toString('utf8'))
    }
    const onError = (error: Error) => fail(error)
    const onAborted = () => fail(new Error('请求在读取完成前已中断。'))

    request.on('data', onData)
    request.on('end', onEnd)
    request.on('error', onError)
    request.on('aborted', onAborted)
  })
}

function formatLimit(limit: number): string {
  if (limit >= 1_000_000) return `${Math.round(limit / 1_000_000)}MB`
  if (limit >= 1_000) return `${Math.round(limit / 1_000)}KB`
  return `${limit}B`
}
