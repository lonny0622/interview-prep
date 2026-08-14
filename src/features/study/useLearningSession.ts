import { useEffect, useMemo, useState } from 'react'
import { questionApi } from '../../api/questionApi'
import { studyApi } from '../../api/studyApi'
import { EMPTY_LEARNING_FILTERS, MASTERY_ORDER } from '../../constants/questions'
import type { AppPage } from '../../types/app'
import type { Mastery, Question } from '../../types/question'
import type { LearningFilters, LearningStats } from '../../types/study'
import { calculateLearningStats } from './learningStats'

type Options = {
  activePage: AppPage
  questions: Question[]
  setQuestions: React.Dispatch<React.SetStateAction<Question[]>>
  serverReady: boolean
  setServerReady: React.Dispatch<React.SetStateAction<boolean>>
}

export function useLearningSession({ activePage, questions, setQuestions, serverReady, setServerReady }: Options) {
  const [index, setIndex] = useState(0)
  const [revealAnswer, setRevealAnswer] = useState(false)
  const [sessionId, setSessionId] = useState<string | null>(null)
  const [sessionCreatedFor, setSessionCreatedFor] = useState('')
  const [filters, setFilters] = useState<LearningFilters>(EMPTY_LEARNING_FILTERS)
  const [remoteStats, setRemoteStats] = useState<LearningStats | null>(null)

  const learningQuestions = useMemo(() => {
    const candidates = questions.filter((question) => (
      (filters.category === '全部分类' || question.category === filters.category)
      && (filters.difficulty === '全部难度' || question.difficulty === filters.difficulty)
      && (filters.mastery === '全部掌握度' || question.mastery === filters.mastery)
    ))
    return candidates.sort((a, b) => {
      const masteryDelta = MASTERY_ORDER.indexOf(a.mastery) - MASTERY_ORDER.indexOf(b.mastery)
      return masteryDelta || b.importance - a.importance || a.title.localeCompare(b.title, 'zh-CN')
    })
  }, [filters, questions])

  const filterKey = `${filters.category}|${filters.difficulty}|${filters.mastery}|${learningQuestions.map((question) => question.id).join(',')}`
  const localStats = useMemo(() => calculateLearningStats(questions), [questions])

  useEffect(() => {
    if (activePage !== 'learning' || !serverReady || !learningQuestions.length || sessionCreatedFor === filterKey) return
    studyApi.createLearningSession(learningQuestions.map((question) => question.id), filters).then((payload) => {
      setSessionId(payload.session.id)
      setSessionCreatedFor(filterKey)
    }).catch(() => setServerReady(false))
  }, [activePage, filterKey, filters, learningQuestions, serverReady, sessionCreatedFor, setServerReady])

  useEffect(() => {
    if (!serverReady) return
    studyApi.learningStats().then((payload) => setRemoteStats(payload.stats)).catch(() => {})
  }, [activePage, serverReady])

  const changeFilters = (patch: Partial<LearningFilters>) => {
    setFilters((current) => ({ ...current, ...patch }))
    setIndex(0)
    setRevealAnswer(false)
    setSessionId(null)
    setSessionCreatedFor('')
  }

  const markMastery = async (nextMastery: Mastery) => {
    const current = learningQuestions[index]
    if (!current) return
    setQuestions((items) => items.map((item) => item.id === current.id ? { ...item, mastery: nextMastery } : item))
    if (serverReady) {
      try {
        await questionApi.update(current.id, { mastery: nextMastery })
        await studyApi.saveLearningProgress(current.id, nextMastery, sessionId)
        const payload = await studyApi.learningStats()
        setRemoteStats(payload.stats)
      } catch {
        setServerReady(false)
      }
    }
    setRevealAnswer(false)
    const remainsInFilter = filters.mastery === '全部掌握度' || filters.mastery === nextMastery
    const nextLength = learningQuestions.length - (remainsInFilter ? 0 : 1)
    if (nextLength > 0) setIndex((currentIndex) => Math.min(currentIndex + 1, nextLength - 1))
  }

  return {
    questions: learningQuestions,
    index,
    revealAnswer,
    stats: remoteStats ?? localStats,
    filters,
    changeFilters,
    markMastery,
    reveal: () => setRevealAnswer(true),
    previous: () => { setIndex((current) => current - 1); setRevealAnswer(false) },
    next: () => { setIndex((current) => current + 1); setRevealAnswer(false) },
  }
}
