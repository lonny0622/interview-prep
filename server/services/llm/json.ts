function fencedCandidates(content: string): string[] {
  return [content.trim(), ...Array.from(content.matchAll(/```(?:json|javascript|typescript|js|ts)?\s*([\s\S]*?)```/gi), (match) => match[1].trim())]
}

export function extractJsonArray<T = unknown>(content: string, errorMessage = '模型返回的数组不是有效 JSON。'): T[] {
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回 JSON 内容。')
  let lastError: unknown
  for (const candidate of fencedCandidates(content)) {
    for (let start = candidate.indexOf('['); start >= 0; start = candidate.indexOf('[', start + 1)) {
      for (let end = candidate.lastIndexOf(']'); end > start; end = candidate.lastIndexOf(']', end - 1)) {
        try {
          const value = JSON.parse(candidate.slice(start, end + 1))
          if (Array.isArray(value)) return value as T[]
        } catch (error) { lastError = error }
      }
    }
  }
  throw new Error(`${errorMessage}${lastError instanceof Error ? lastError.message : ''}`)
}

export function extractJsonObject<T = Record<string, unknown>>(content: string, errorMessage = '模型返回的对象不是有效 JSON。'): T {
  if (typeof content !== 'string' || !content.trim()) throw new Error('模型没有返回 JSON 内容。')
  const candidate = content.match(/\{[\s\S]*\}/)?.[0]
  if (!candidate) throw new Error(errorMessage)
  try { return JSON.parse(candidate) as T } catch (error) { throw new Error(`${errorMessage}${error instanceof Error ? error.message : ''}`) }
}
