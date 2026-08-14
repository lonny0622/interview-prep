import { useState } from 'react'
import { scoringApi, speechApi } from '../../api/interviewApi'
import { studyApi } from '../../api/studyApi'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import type { ScoreResult } from '../../types/interview'
import type { Question } from '../../types/question'
import type { PracticeFilters, PracticeState } from '../../types/study'

export function usePracticeSession(questions: Question[]) {
  const [practice, setPractice] = useState<PracticeState | null>(null)
  const recorder = useAudioRecorder({
    transcribe: async (audioBase64, mimeType) => (await speechApi.transcribe(audioBase64, mimeType)).text,
    onTranscribed: (text) => setPractice((current) => current ? { ...current, answer: current.answer ? `${current.answer}\n${text}` : text } : current),
  })

  const start = async (filters: PracticeFilters) => {
    const candidates = questions.filter((question) => (
      (filters.category === '全部分类' || question.category === filters.category)
      && (filters.difficulty === '全部难度' || question.difficulty === filters.difficulty)
      && (filters.mastery === '全部掌握度' || question.mastery === filters.mastery)
    ))
    if (!candidates.length) return
    recorder.reset()
    try {
      const payload = await studyApi.createPracticeSession(candidates.map((question) => question.id), filters)
      setPractice({ questionIds: candidates.map((question) => question.id), index: 0, sessionId: payload.session.id, answer: '', submitted: false, scoring: false, score: null, ...filters })
    } catch {
      setPractice({ questionIds: candidates.map((question) => question.id), index: 0, sessionId: crypto.randomUUID(), answer: '', submitted: false, scoring: false, score: null, ...filters })
    }
  }

  const submit = async () => {
    if (!practice?.answer.trim()) return
    const current = questions.find((question) => question.id === practice.questionIds[practice.index])
    if (!current) return
    setPractice({ ...practice, scoring: true })
    try {
      const score = (await scoringApi.score(current, practice.answer)).score
      await studyApi.savePracticeAnswer({ sessionId: practice.sessionId, questionId: current.id, answerText: practice.answer, score }).catch(() => {})
      setPractice({ ...practice, submitted: true, scoring: false, score })
    } catch {
      const score: ScoreResult = { score: 0, strengths: [], gaps: ['评分服务暂时不可用，请稍后重试。'], betterAnswer: '' }
      setPractice({ ...practice, submitted: true, scoring: false, score })
    }
  }

  const exit = () => {
    recorder.reset()
    setPractice(null)
  }

  const next = () => {
    recorder.reset()
    setPractice((current) => !current || current.index >= current.questionIds.length - 1
      ? null
      : { ...current, index: current.index + 1, answer: '', submitted: false, scoring: false, score: null })
  }

  return {
    practice,
    voice: recorder.state,
    start,
    submit,
    exit,
    next,
    setAnswer: (answer: string) => setPractice((current) => current ? { ...current, answer } : current),
    startRecording: recorder.start,
    stopRecording: recorder.stop,
    resetRecording: recorder.reset,
  }
}
