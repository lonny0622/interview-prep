export type ExplanationMessage = {
  role: 'user' | 'assistant'
  content: string
}

export type ExplainSelectionInput = {
  question: {
    title: string
    category: string
    difficulty: string
    answer: string
    explanation: string
    interviewAnswer: string
    followUps: string[]
  }
  selectedText: string
  prompt: string
  history: ExplanationMessage[]
}
