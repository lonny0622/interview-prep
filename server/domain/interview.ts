import type { StructuredProfile } from './profile.js'
import type { ScoreResult } from './question.js'

export type InterviewStage = 'self_introduction' | 'project_experience' | 'knowledge' | 'scenario' | 'follow_up' | 'candidate_questions'

export type InterviewBlueprintItem = {
  stage: InterviewStage
  kind: string
  question: string
  focus: string
  referenceAnswer: string
  followUps: string[]
}

export type InterviewProfile = Record<string, unknown> & {
  role?: string
  resume?: string
  resumeFileName?: string
  jd?: string
  jobProfileId?: string
  resumeId?: string
  candidateProfile?: StructuredProfile | null
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
  stage: InterviewStage
  profile: InterviewProfile
  blueprint: InterviewBlueprintItem[]
  currentIndex: number
  report: InterviewReport | null
  createdAt: string
  updatedAt: string
}

export type SaveInterviewTurnInput = {
  stage: InterviewStage
  question: string
  answerText: string
}

export type InterviewTurn = SaveInterviewTurnInput & {
  id: string
  sessionId: string
  score: ScoreResult | null
  createdAt?: string
}

export type InterviewNextAction = {
  action: 'follow_up' | 'advance_stage' | 'finish'
  reason: string
  question: string
  kind: string
  focus: string
  referenceAnswer: string
}
