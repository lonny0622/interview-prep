import type { FollowUp } from '../types/question'

const asRecord = (value: unknown): Record<string, unknown> => typeof value === 'object' && value !== null ? value as Record<string, unknown> : {}

/** 浏览器端兼容 localStorage 和旧接口中的 string[]。 */
export function normalizeFollowUps(value: unknown, limit = 10): FollowUp[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((entry) => {
    if (typeof entry === 'string') {
      const question = entry.trim()
      return question ? [{ question, answer: '' }] : []
    }
    const item = asRecord(entry)
    const question = String(item.question ?? item.title ?? item.followUp ?? '').trim()
    if (!question) return []
    return [{ question, answer: String(item.answer ?? item.response ?? '').trim() }]
  }).slice(0, limit)
}

/** 编辑追问文本时按位置保留已有答案。 */
export function updateFollowUpQuestions(current: FollowUp[], source: string): FollowUp[] {
  return source.split('\n').map((question) => question.trim()).filter(Boolean).map((question, index) => ({
    question,
    answer: current[index]?.answer || '',
  }))
}

export const followUpQuestionsText = (followUps: FollowUp[]) => normalizeFollowUps(followUps).map((item) => item.question).join('\n')
