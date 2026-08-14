export type InterviewSetup = {
  role: string
  company: string
  jd: string
  resume: string
  jobProfileId: string
  resumeId: string
  duration: string
  difficulty: string
}

export type ScoreResult = {
  score: number
  dimensions?: Record<string, number>
  strengths: string[]
  gaps: string[]
  betterAnswer: string
  source?: string
  fallbackReason?: string
}

export type InterviewBlueprintItem = {
  stage: string
  kind: string
  question: string
  focus: string
  referenceAnswer: string
  followUps: string[]
}

export type InterviewReport = {
  summary: string
  strengths: string[]
  risks: string[]
  suggestions: string[]
  nextQuestions: string[]
}

export type InterviewSession = {
  id: string
  status: 'active' | 'completed'
  stage: string
  profile: Record<string, unknown>
  blueprint: InterviewBlueprintItem[]
  currentIndex: number
  report: InterviewReport | null
  createdAt?: string
  updatedAt?: string
}

export type InterviewTurn = {
  id: string
  sessionId: string
  stage: string
  question: string
  answerText: string
  score: ScoreResult | null
  createdAt?: string
}

export type SaveInterviewTurnInput = Pick<InterviewTurn, 'stage' | 'question' | 'answerText'> & {
  referenceAnswer: string
}

export type InterviewNextAction = {
  action: 'follow_up' | 'advance_stage' | 'finish'
  reason: string
  question: string
  kind: string
  focus: string
  referenceAnswer: string
}
