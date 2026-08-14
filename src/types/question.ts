export type Difficulty = '简单' | '中等' | '困难'

export type Mastery = '未学习' | '了解' | '熟悉' | '掌握'

export type Question = {
  id: string
  title: string
  category: string
  difficulty: Difficulty
  importance: number
  mastery: Mastery
  answer: string
  explanation: string
  interviewAnswer: string
  followUps: string[]
}

export type QuestionDraft = Omit<Question, 'id' | 'mastery'>

export type QuestionCategory = {
  id: string
  name: string
  sortOrder: number
  questionCount: number
}

export type QuestionEditorState = {
  mode: 'create' | 'edit'
  draft: QuestionDraft
}

export type QuestionImporterState = {
  step: 'input' | 'preview'
  source: string
  category: string
  drafts: QuestionDraft[]
  error: string
  processing: boolean
}
