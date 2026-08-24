import type { Question } from './question'

export type ExplainMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ExplainSession = {
  id: string
  question: Question
  selectedText: string
  messages: ExplainMessage[]
  createdAt: string
  updatedAt: string
}

export type ExplainDialogState = ExplainSession & {
  input: string
  streaming: boolean
  error: string
}
