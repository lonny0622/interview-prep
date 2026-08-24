import { appConfig } from '../../config/env.js'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatRequest = { model: string; temperature?: number; max_tokens?: number; messages: ChatMessage[] }
export type ChatClientConfig = { baseUrl: string; apiKey: string; requestTimeoutMs: number; model?: string }

type ChatResponse = { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } }

type ChatChunk = {
  choices?: Array<{ delta?: { content?: unknown }; message?: { content?: unknown } }>
  content?: unknown
  error?: { message?: string }
}

/** 单一上游模型入口，集中处理鉴权、超时和 OpenAI-compatible 错误。 */
export async function completeChat(request: Omit<ChatRequest, 'model'> & { model?: string }, config: ChatClientConfig = appConfig): Promise<string> {
  const model = request.model || appConfig.model
  if (!config.baseUrl || !model || !config.apiKey) throw new Error('LLM Gateway 配置不完整，请检查 .env.local。')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs)
  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json' },
      signal: controller.signal,
      body: JSON.stringify({ ...request, model }),
    })
    const payload = await response.json().catch(() => ({})) as ChatResponse
    if (!response.ok) throw new Error(payload.error?.message || `上游模型请求失败（${response.status}）。`)
    const content = payload.choices?.[0]?.message?.content
    if (typeof content !== 'string') throw new Error('上游模型没有返回文本内容。')
    return content
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`模型请求超过 ${Math.round(config.requestTimeoutMs / 1000)} 秒，已自动停止。`)
    throw error
  } finally {
    clearTimeout(timeout)
  }
}

/**
 * 读取 OpenAI-compatible 的 SSE/NDJSON 增量响应。
 * 上游只负责返回 token，业务路由决定如何包装成自己的事件协议。
 */
export async function* streamChat(
  request: Omit<ChatRequest, 'model'> & { model?: string },
  config: ChatClientConfig = appConfig,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const model = request.model || config.model
  if (!config.baseUrl || !model || !config.apiKey) throw new Error('LLM Gateway 配置不完整，请检查 .env.local。')

  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), config.requestTimeoutMs)
  const forwardAbort = () => controller.abort()
  signal?.addEventListener('abort', forwardAbort, { once: true })

  try {
    const response = await fetch(`${config.baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${config.apiKey}`, 'Content-Type': 'application/json', Accept: 'text/event-stream' },
      signal: controller.signal,
      body: JSON.stringify({ ...request, model, stream: true }),
    })
    if (!response.ok) {
      const payload = await response.json().catch(() => ({})) as ChatResponse
      throw new Error(payload.error?.message || `上游模型请求失败（${response.status}）。`)
    }
    if (!response.body) throw new Error('上游模型没有返回可读取的流。')

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let finished = false
    try {
      while (!finished) {
        const { done, value } = await reader.read()
        buffer += decoder.decode(value, { stream: !done })
        const lines = buffer.split(/\r?\n/)
        buffer = lines.pop() || ''
        for (const line of lines) {
          const payload = parseChatChunk(line)
          if (!payload) continue
          if (payload === '[DONE]') { finished = true; break }
          if (payload) yield payload
        }
        if (done) break
      }
      if (!finished && buffer.trim()) {
        const payload = parseChatChunk(buffer)
        if (payload && payload !== '[DONE]') yield payload
      }
    } finally {
      reader.releaseLock()
    }
  } catch (error) {
    if (error instanceof Error && error.name === 'AbortError') throw new Error(`模型请求超过 ${Math.round(config.requestTimeoutMs / 1000)} 秒，已自动停止。`)
    throw error
  } finally {
    clearTimeout(timeout)
    signal?.removeEventListener('abort', forwardAbort)
  }
}

function parseChatChunk(line: string): string | null {
  const trimmed = line.trim()
  if (!trimmed) return null
  const data = trimmed.startsWith('data:') ? trimmed.slice(5).trim() : trimmed
  if (!data) return null
  if (data === '[DONE]') return data
  try {
    const payload = JSON.parse(data) as ChatChunk
    if (payload.error?.message) throw new Error(payload.error.message)
    const content = payload.choices?.[0]?.delta?.content ?? payload.choices?.[0]?.message?.content ?? payload.content
    return typeof content === 'string' ? content : null
  } catch (error) {
    if (error instanceof SyntaxError) return null
    throw error
  }
}
