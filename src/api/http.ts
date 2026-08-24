export const AUTH_REQUIRED_EVENT = 'interviewprep:auth-required'

function notifyIfUnauthorized(response: Response): void {
  if (response.status === 401) window.dispatchEvent(new Event(AUTH_REQUIRED_EVENT))
}

export async function apiRequest<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
  })
  notifyIfUnauthorized(response)
  const payload = await response.json().catch(() => ({})) as { error?: string }
  if (!response.ok) throw new Error(payload.error || '请求失败。')
  return payload as T
}

/** 逐行解析 Gateway 的 NDJSON 响应，避免长任务必须等完整 JSON 才能返回。 */
export async function streamJsonLines<T>(url: string, init: RequestInit, onEvent: (event: T) => void): Promise<void> {
  const response = await fetch(url, {
    ...init,
    credentials: 'same-origin',
    headers: { 'Content-Type': 'application/json', Accept: 'application/x-ndjson', ...(init.headers || {}) },
  })
  notifyIfUnauthorized(response)
  if (!response.ok) {
    const payload = await response.json().catch(() => ({})) as { error?: string }
    if (response.status === 502 && !payload.error) {
      throw new Error('无法连接后端网关，请确认 pnpm gateway 已启动。')
    }
    throw new Error(payload.error || `请求失败（HTTP ${response.status}）。`)
  }
  if (!response.body) throw new Error('浏览器无法读取流式响应。')

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  try {
    while (true) {
      const { done, value } = await reader.read()
      buffer += decoder.decode(value, { stream: !done })
      const lines = buffer.split('\n')
      buffer = lines.pop() || ''
      for (const line of lines) if (line.trim()) onEvent(JSON.parse(line) as T)
      if (done) break
    }
    if (buffer.trim()) onEvent(JSON.parse(buffer) as T)
  } catch (error) {
    await reader.cancel().catch(() => {})
    throw error
  } finally {
    reader.releaseLock()
  }
}
