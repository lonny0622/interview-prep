import type { Question, QuestionDraft } from '../types/question'
import type { InterviewNextAction, InterviewReport, InterviewSession, InterviewSetup, InterviewTurn, SaveInterviewTurnInput, ScoreResult } from '../types/interview'
import { apiRequest, streamJsonLines } from './http'

type EnrichQuestionsInput = { category: string; questions: Array<{ title: string; difficulty: string }>; context?: string }
type FollowUpGenerationQuestion = Pick<Question, 'title' | 'category' | 'difficulty' | 'answer'>
export type EnrichQuestionsProgress = { drafts: QuestionDraft[]; completed: number; total: number; status?: string; retrying?: boolean }
type EnrichQuestionsEvent =
  | { type: 'start'; total: number }
  | ({ type: 'progress' } & EnrichQuestionsProgress)
  | { type: 'complete'; completed: number; total: number }
  | { type: 'error'; error: string; completed: number; total: number }

export const interviewApi = {
  create: (profile: InterviewSetup) => apiRequest<{ session: InterviewSession }>('/api/interview-sessions', { method: 'POST', body: JSON.stringify({ profile }) }),
  saveTurn: (id: string, payload: SaveInterviewTurnInput) => apiRequest<{ turn: InterviewTurn }>(`/api/interview-sessions/${id}/turns`, { method: 'POST', body: JSON.stringify(payload) }),
  nextAction: (id: string, answerText: string) => apiRequest<{ action: InterviewNextAction; session: InterviewSession }>(`/api/interview-sessions/${id}/next-action`, { method: 'POST', body: JSON.stringify({ answerText }) }),
  complete: (id: string) => apiRequest<{ session: InterviewSession; report: InterviewReport }>(`/api/interview-sessions/${id}/complete`, { method: 'POST' }),
}

export const speechApi = {
  transcribe: (audioBase64: string, mimeType: string) => apiRequest<{ text: string }>('/api/stt/transcribe', { method: 'POST', body: JSON.stringify({ audioBase64, mimeType }) }),
}

export const scoringApi = {
  score: (question: Pick<Question, 'title' | 'answer' | 'interviewAnswer'>, answer: string) => apiRequest<{ score: ScoreResult }>('/api/score-answer', { method: 'POST', body: JSON.stringify({ question, answer }) }),
}

export const llmApi = {
  generateFollowUpAnswer: (payload: { question: FollowUpGenerationQuestion; followUpQuestion: string; supplementalInfo?: string }) => apiRequest<{ answer: string; model: string }>('/api/llm/follow-up-answer', {
    method: 'POST',
    body: JSON.stringify(payload),
  }),
  enrichQuestions: async (payload: EnrichQuestionsInput, onProgress?: (progress: EnrichQuestionsProgress) => void, signal?: AbortSignal) => {
    const drafts: QuestionDraft[] = []
    let consecutiveFailures = 0
    while (drafts.length < payload.questions.length) {
      if (signal?.aborted) throw new DOMException('请求已取消。', 'AbortError')
      const completedBeforeRequest = drafts.length
      let streamError = ''
      try {
        await streamJsonLines<EnrichQuestionsEvent>('/api/llm/enrich-questions/stream', {
          method: 'POST',
          body: JSON.stringify({ ...payload, questions: payload.questions.slice(completedBeforeRequest) }),
          signal,
        }, (event) => {
          if (event.type === 'error') { streamError = event.error; return }
          if (event.type !== 'progress') return
          drafts.push(...event.drafts)
          onProgress?.({ drafts: [...drafts], completed: drafts.length, total: payload.questions.length })
        })
      } catch (error) {
        if (signal?.aborted) throw error
        streamError = error instanceof Error ? error.message : '流式连接意外中断。'
      }
      if (drafts.length >= payload.questions.length) break

      consecutiveFailures = drafts.length > completedBeforeRequest ? 0 : consecutiveFailures + 1
      if (consecutiveFailures >= 3) throw new Error(`${streamError || '模型没有继续返回内容。'} 已保留前 ${drafts.length} 道结果，可稍后继续生成剩余题目。`)
      onProgress?.({
        drafts: [...drafts], completed: drafts.length, total: payload.questions.length, retrying: true,
        status: `本批次处理失败，正在从第 ${drafts.length + 1} 道题自动继续…`,
      })
      await new Promise((resolve) => setTimeout(resolve, 800 * (consecutiveFailures + 1)))
    }
    return { drafts }
  },
}
