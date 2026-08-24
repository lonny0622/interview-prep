import type { ExplainMessage } from '../types/ai'
import type { Question } from '../types/question'
import { streamJsonLines } from './http'

type ExplainInput = {
  question: Question
  selectedText: string
  prompt: string
  history: ExplainMessage[]
}

type ExplainEvent =
  | { type: 'start' }
  | { type: 'delta'; content: string }
  | { type: 'complete' }
  | { type: 'error'; error: string }

export const aiApi = {
  explainSelection: async (input: ExplainInput, onDelta: (content: string) => void, signal?: AbortSignal) => {
    try {
      await streamJsonLines<ExplainEvent>('/api/llm/explain-selection/stream', {
        method: 'POST',
        body: JSON.stringify(input),
        signal,
      }, (event) => {
        if (event.type === 'delta') onDelta(event.content)
        if (event.type === 'error') throw new Error(event.error)
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Not Found') {
        throw new Error('AI 网关未加载最新路由，请重启 pnpm gateway。')
      }
      throw error
    }
  },
}
