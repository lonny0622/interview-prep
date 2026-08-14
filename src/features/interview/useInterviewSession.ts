import { useState } from 'react'
import { interviewApi, speechApi } from '../../api/interviewApi'
import { useAudioRecorder } from '../../hooks/useAudioRecorder'
import type { InterviewSession, InterviewSetup, InterviewViewState } from '../../types/interview'

const EMPTY_SETUP: InterviewSetup = {
  role: '', company: '', jd: '', resume: '', jobProfileId: '', resumeId: '', duration: '30 分钟', difficulty: '中等',
}

export function useInterviewSession() {
  const [interview, setInterview] = useState<InterviewViewState | null>(null)
  const [setup, setSetup] = useState<InterviewSetup>(EMPTY_SETUP)
  const recorder = useAudioRecorder({
    transcribe: async (audioBase64, mimeType) => (await speechApi.transcribe(audioBase64, mimeType)).text,
    onTranscribed: (text) => setInterview((current) => current ? { ...current, answer: current.answer ? `${current.answer}\n${text}` : text } : current),
  })

  const start = async () => {
    if (!setup.role.trim() && !setup.jd.trim()) return
    setInterview({ session: {} as InterviewSession, turns: [], answer: '', loading: true, completing: false, report: null, error: '' })
    try {
      const payload = await interviewApi.create(setup)
      setInterview({ session: payload.session, turns: [], answer: '', loading: false, completing: false, report: null, error: '' })
    } catch (error) {
      setInterview(null)
      window.alert(error instanceof Error ? error.message : '模拟面试创建失败。')
    }
  }

  const submitTurn = async () => {
    if (!interview?.session.id || !interview.answer.trim()) return
    const current = interview.session.blueprint[interview.session.currentIndex]
    if (!current) return
    setInterview({ ...interview, loading: true })
    try {
      const payload = await interviewApi.saveTurn(interview.session.id, { stage: current.stage, question: current.question, referenceAnswer: current.referenceAnswer, answerText: interview.answer })
      const nextIndex = Math.min(interview.session.currentIndex + 1, interview.session.blueprint.length - 1)
      const nextSession = { ...interview.session, currentIndex: nextIndex, stage: interview.session.blueprint[nextIndex]?.stage || current.stage }
      const nextTurns = [...interview.turns, payload.turn]
      const actionPayload = await interviewApi.nextAction(interview.session.id, interview.answer)
      if (actionPayload.action.action === 'finish') {
        const reviewPayload = await interviewApi.complete(interview.session.id)
        setInterview({ ...interview, session: reviewPayload.session, turns: nextTurns, answer: '', loading: false, completing: false, report: reviewPayload.report, error: '' })
      } else {
        setInterview({ ...interview, session: actionPayload.session || nextSession, turns: nextTurns, answer: '', loading: false, completing: false, report: null, error: '' })
      }
      recorder.reset()
    } catch (error) {
      setInterview({ ...interview, loading: false, error: error instanceof Error ? error.message : '回答保存失败。' })
    }
  }

  const complete = async () => {
    if (!interview?.session.id) return
    setInterview({ ...interview, completing: true, error: '' })
    try {
      const payload = await interviewApi.complete(interview.session.id)
      setInterview({ ...interview, session: payload.session, completing: false, report: payload.report, error: '' })
    } catch (error) {
      setInterview({ ...interview, completing: false, error: error instanceof Error ? error.message : '复盘生成失败。' })
    }
  }

  const exit = () => {
    recorder.reset()
    setInterview(null)
  }

  return {
    interview,
    setup,
    setSetup,
    voice: recorder.state,
    start,
    submitTurn,
    complete,
    exit,
    setAnswer: (answer: string) => setInterview((current) => current ? { ...current, answer } : current),
    toggleRecording: () => recorder.state.recording ? recorder.stop() : void recorder.start(),
  }
}
