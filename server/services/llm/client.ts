import { appConfig } from '../../config/env.js'

export type ChatMessage = { role: 'system' | 'user' | 'assistant'; content: string }
export type ChatRequest = { model: string; temperature?: number; max_tokens?: number; messages: ChatMessage[] }
export type ChatClientConfig = { baseUrl: string; apiKey: string; requestTimeoutMs: number }

type ChatResponse = { choices?: Array<{ message?: { content?: unknown } }>; error?: { message?: string } }

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
