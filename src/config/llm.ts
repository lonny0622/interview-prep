export type LlmConfig = {
  provider: string
  baseUrl: string
  model: string
  hasApiKey: boolean
}

export const llmConfig: LlmConfig = {
  provider: import.meta.env.VITE_LLM_PROVIDER ?? 'openai-compatible',
  baseUrl: import.meta.env.VITE_LLM_BASE_URL ?? '',
  model: import.meta.env.VITE_LLM_MODEL ?? '',
  hasApiKey: Boolean(import.meta.env.VITE_LLM_API_KEY),
}

export const llmStatus = llmConfig.hasApiKey && Boolean(llmConfig.baseUrl && llmConfig.model)

// Keep provider calls behind this boundary. The browser UI should eventually call a server-side gateway.
export async function generateStructured<T>(_prompt: string): Promise<T> {
  throw new Error('LLM Gateway 尚未接入，请先配置服务端代理。')
}
