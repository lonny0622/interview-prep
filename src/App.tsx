import { useEffect, useMemo, useState } from 'react'
import './App.css'
import { interviewApi, llmApi, scoringApi, speechApi } from './api/interviewApi'
import { profileApi } from './api/profileApi'
import { questionApi } from './api/questionApi'
import { studyApi } from './api/studyApi'
import { AppSidebar } from './components/layout/AppSidebar'
import { ProfileCenter } from './components/profile/ProfileCenter'
import { CategoryManagerModal } from './components/questions/CategoryManagerModal'
import { QuestionEditorModal } from './components/questions/QuestionEditorModal'
import { QuestionImportModal } from './components/questions/QuestionImportModal'
import { EMPTY_LEARNING_FILTERS, EMPTY_QUESTION_DRAFT, MASTERY_ORDER, QUESTION_STORAGE_KEY, SEED_QUESTIONS } from './constants/questions'
import { parseImportedQuestions, parseQuestionOutline } from './features/questionImport'
import { calculateLearningStats } from './features/study/learningStats'
import { useAudioRecorder } from './hooks/useAudioRecorder'
import { InterviewPage } from './pages/interview/InterviewPage'
import { LearningPage } from './pages/learning/LearningPage'
import { LibraryPage } from './pages/library/LibraryPage'
import { PracticePage } from './pages/practice/PracticePage'
import type { AppPage } from './types/app'
import type { InterviewSession, InterviewSetup, InterviewViewState, ScoreResult } from './types/interview'
import type { JobProfile, UserProfile } from './types/profile'
import type { Mastery, Question, QuestionCategory, QuestionEditorState, QuestionImporterState } from './types/question'
import type { LearningFilters, LearningStats, PracticeFilters, PracticeState } from './types/study'

const EMPTY_PROFILE: UserProfile = {
  id: 1, name: '', headline: '', yearsExperience: 0, targetRoles: [], resumeText: '',
  resumeFileName: '', resumes: [], candidateProfile: null, parsedAt: null,
}

const EMPTY_INTERVIEW_SETUP: InterviewSetup = {
  role: '', company: '', jd: '', resume: '', jobProfileId: '', resumeId: '', duration: '30 分钟', difficulty: '中等',
}

function loadLocalQuestions(): Question[] {
  try {
    const saved = localStorage.getItem(QUESTION_STORAGE_KEY)
    return saved ? JSON.parse(saved) as Question[] : SEED_QUESTIONS
  } catch {
    return SEED_QUESTIONS
  }
}

function App() {
  const [questions, setQuestions] = useState<Question[]>(loadLocalQuestions)
  const [activePage, setActivePage] = useState<AppPage>('library')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部分类')
  const [difficulty, setDifficulty] = useState('全部难度')
  const [mastery, setMastery] = useState('全部掌握度')
  const [selectedId, setSelectedId] = useState(SEED_QUESTIONS[0].id)
  const [showAnswer, setShowAnswer] = useState(false)
  const [editor, setEditor] = useState<QuestionEditorState | null>(null)
  const [importer, setImporter] = useState<QuestionImporterState | null>(null)
  const [serverReady, setServerReady] = useState(false)
  const [categoryCatalog, setCategoryCatalog] = useState<QuestionCategory[]>([])
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const [profile, setProfile] = useState<UserProfile>(EMPTY_PROFILE)
  const [profileOpen, setProfileOpen] = useState(false)
  const [jobs, setJobs] = useState<JobProfile[]>([])
  const [learningIndex, setLearningIndex] = useState(0)
  const [learningReveal, setLearningReveal] = useState(false)
  const [learningSessionId, setLearningSessionId] = useState<string | null>(null)
  const [learningSessionCreatedFor, setLearningSessionCreatedFor] = useState('')
  const [learningFilters, setLearningFilters] = useState<LearningFilters>(EMPTY_LEARNING_FILTERS)
  const [learningStats, setLearningStats] = useState<LearningStats | null>(null)
  const [practice, setPractice] = useState<PracticeState | null>(null)
  const [interview, setInterview] = useState<InterviewViewState | null>(null)
  const [interviewSetup, setInterviewSetup] = useState<InterviewSetup>(EMPTY_INTERVIEW_SETUP)

  const practiceRecorder = useAudioRecorder({
    transcribe: async (audioBase64, mimeType) => (await speechApi.transcribe(audioBase64, mimeType)).text,
    onTranscribed: (text) => setPractice((current) => current ? { ...current, answer: current.answer ? `${current.answer}\n${text}` : text } : current),
  })
  const interviewRecorder = useAudioRecorder({
    transcribe: async (audioBase64, mimeType) => (await speechApi.transcribe(audioBase64, mimeType)).text,
    onTranscribed: (text) => setInterview((current) => current ? { ...current, answer: current.answer ? `${current.answer}\n${text}` : text } : current),
  })

  useEffect(() => { localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify(questions)) }, [questions])

  useEffect(() => {
    questionApi.list().then((payload) => {
      setQuestions(payload.questions)
      setSelectedId(payload.questions[0]?.id ?? '')
      setServerReady(true)
    }).catch(() => setServerReady(false))
  }, [])

  useEffect(() => {
    questionApi.categories().then((payload) => setCategoryCatalog(payload.categories)).catch(() => {})
  }, [])

  useEffect(() => {
    profileApi.get().then((payload) => {
      setProfile(payload.profile)
      setJobs(payload.profile.jobs || [])
    }).catch(() => {})
  }, [])

  const selected = questions.find((question) => question.id === selectedId) ?? questions[0]
  const categories = ['全部分类', ...new Set([...categoryCatalog.map((item) => item.name), ...questions.map((question) => question.category)])]
  const filteredQuestions = useMemo(() => questions.filter((question) => {
    const haystack = [question.title, question.category, question.answer, question.explanation, question.interviewAnswer, ...question.followUps].join('\n').toLowerCase()
    return haystack.includes(query.toLowerCase())
      && (category === '全部分类' || question.category === category)
      && (difficulty === '全部难度' || question.difficulty === difficulty)
      && (mastery === '全部掌握度' || question.mastery === mastery)
  }), [category, difficulty, mastery, query, questions])

  const learningQuestions = useMemo(() => {
    const candidates = questions.filter((question) => (
      (learningFilters.category === '全部分类' || question.category === learningFilters.category)
      && (learningFilters.difficulty === '全部难度' || question.difficulty === learningFilters.difficulty)
      && (learningFilters.mastery === '全部掌握度' || question.mastery === learningFilters.mastery)
    ))
    return candidates.sort((a, b) => {
      const masteryDelta = MASTERY_ORDER.indexOf(a.mastery) - MASTERY_ORDER.indexOf(b.mastery)
      return masteryDelta || b.importance - a.importance || a.title.localeCompare(b.title, 'zh-CN')
    })
  }, [learningFilters, questions])

  const learningFilterKey = `${learningFilters.category}|${learningFilters.difficulty}|${learningFilters.mastery}|${learningQuestions.map((question) => question.id).join(',')}`
  const localLearningStats = useMemo(() => calculateLearningStats(questions), [questions])

  useEffect(() => {
    if (activePage !== 'learning' || !serverReady || !learningQuestions.length || learningSessionCreatedFor === learningFilterKey) return
    studyApi.createLearningSession(learningQuestions.map((question) => question.id), learningFilters).then((payload) => {
      setLearningSessionId(payload.session.id)
      setLearningSessionCreatedFor(learningFilterKey)
    }).catch(() => setServerReady(false))
  }, [activePage, learningFilters, learningQuestions, learningFilterKey, learningSessionCreatedFor, serverReady])

  useEffect(() => {
    if (!serverReady) return
    studyApi.learningStats().then((payload) => setLearningStats(payload.stats)).catch(() => {})
  }, [activePage, serverReady])

  const refreshLearningStats = () => {
    if (serverReady) studyApi.learningStats().then((payload) => setLearningStats(payload.stats)).catch(() => {})
  }

  const changeLearningFilters = (patch: Partial<LearningFilters>) => {
    setLearningFilters((current) => ({ ...current, ...patch }))
    setLearningIndex(0)
    setLearningReveal(false)
    setLearningSessionId(null)
    setLearningSessionCreatedFor('')
  }

  const updateMastery = (nextMastery: Mastery) => {
    if (!selected) return
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, mastery: nextMastery } : question))
    if (serverReady) questionApi.update(selected.id, { mastery: nextMastery }).catch(() => setServerReady(false))
  }

  const openEditor = (question?: Question) => {
    setEditor(question ? {
      mode: 'edit',
      draft: {
        title: question.title, category: question.category, difficulty: question.difficulty,
        importance: question.importance, answer: question.answer, explanation: question.explanation,
        interviewAnswer: question.interviewAnswer, followUps: question.followUps,
      },
    } : { mode: 'create', draft: EMPTY_QUESTION_DRAFT })
  }

  const createCategory = async (name: string) => {
    const { category: created } = await questionApi.createCategory(name)
    setCategoryCatalog((current) => [...current, created].sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name, 'zh-CN')))
    return created.name
  }

  const renameCategory = async (categoryToRename: QuestionCategory, name: string) => {
    const { category: renamed } = await questionApi.updateCategory(categoryToRename.id, name)
    setCategoryCatalog((current) => current.map((item) => item.id === categoryToRename.id ? renamed : item))
    setQuestions((current) => current.map((question) => question.category.toLocaleLowerCase() === categoryToRename.name.toLocaleLowerCase() ? { ...question, category: renamed.name } : question))
    setCategory((current) => current === categoryToRename.name ? renamed.name : current)
  }

  const deleteCategory = async (categoryToDelete: QuestionCategory) => {
    await questionApi.deleteCategory(categoryToDelete.id)
    setCategoryCatalog((current) => current.filter((item) => item.id !== categoryToDelete.id))
    setCategory((current) => current === categoryToDelete.name ? '全部分类' : current)
  }

  const registerCategoryLocally = (name: string) => {
    const normalized = name.trim()
    if (!normalized) return
    setCategoryCatalog((current) => current.some((item) => item.name === normalized)
      ? current
      : [...current, { id: `local-${normalized}`, name: normalized, sortOrder: current.length, questionCount: 0 }])
  }

  const saveQuestion = () => {
    if (!editor || !editor.draft.title.trim() || !editor.draft.category.trim()) return
    if (editor.mode === 'edit' && selected) {
      setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, ...editor.draft } : question))
      registerCategoryLocally(editor.draft.category)
      if (serverReady) void questionApi.update(selected.id, editor.draft).catch(() => setServerReady(false))
    } else {
      const temporary: Question = { ...editor.draft, id: crypto.randomUUID(), mastery: '未学习' }
      setQuestions((current) => [temporary, ...current])
      registerCategoryLocally(editor.draft.category)
      setSelectedId(temporary.id)
      if (serverReady) void questionApi.create([editor.draft]).then((payload) => {
        const created = payload.questions[0]
        if (created) setQuestions((current) => [created, ...current.filter((item) => item.id !== temporary.id)])
      }).catch(() => setServerReady(false))
    }
    setEditor(null)
  }

  const deleteQuestion = () => {
    if (!selected || !window.confirm('确认删除这道题目？此操作无法撤销。')) return
    const nextQuestions = questions.filter((question) => question.id !== selected.id)
    setQuestions(nextQuestions)
    setSelectedId(nextQuestions[0]?.id ?? '')
    if (serverReady) void questionApi.remove(selected.id).catch(() => setServerReady(false))
  }

  const importPreview = () => {
    if (!importer) return
    try {
      const drafts = parseImportedQuestions(importer.source)
      if (!drafts.length) throw new Error('没有解析到有效题目，请检查格式。')
      setImporter({ ...importer, step: 'preview', category: drafts[0]?.category || importer.category || '未分类', drafts, error: '' })
    } catch (error) {
      setImporter({ ...importer, error: error instanceof Error ? error.message : '导入内容无法解析。' })
    }
  }

  const importWithAi = async () => {
    if (!importer?.source.trim()) return
    const outline = parseQuestionOutline(importer.source, importer.category)
    if (!outline.questions.length) {
      setImporter({ ...importer, error: '没有识别到题目。请每行写一道题，并用 ⭐ Level 1/2/3 标记难度。' })
      return
    }
    setImporter({ ...importer, category: outline.category, processing: true, error: '' })
    try {
      const payload = await llmApi.enrichQuestions({ category: outline.category, questions: outline.questions, source: importer.source }, AbortSignal.timeout(240_000))
      if (payload.drafts.length !== outline.questions.length) throw new Error('AI 返回的题目数量不完整，请重试。')
      setImporter({ step: 'preview', source: importer.source, category: outline.category, drafts: payload.drafts, error: '', processing: false })
    } catch (error) {
      const message = error instanceof Error ? error.message : 'AI 解析失败。'
      setImporter({ ...importer, processing: false, error: /JSON|Unexpected token|格式/.test(message) ? '模型返回格式不完整，系统已自动重试；仍失败时请再次点击生成。' : message })
    }
  }

  const confirmImport = () => {
    if (!importer?.drafts.length) return
    const incomplete = importer.drafts.filter((draft) => !draft.title.trim() || !draft.answer.trim() || !draft.explanation.trim() || !draft.interviewAnswer.trim())
    if (incomplete.length) {
      setImporter({ ...importer, error: `还有 ${incomplete.length} 道题目的答案、解析或建议回答为空，请补充后再导入。` })
      return
    }
    const imported: Question[] = importer.drafts.map((draft) => ({ ...draft, id: crypto.randomUUID(), mastery: '未学习' }))
    setQuestions((current) => [...imported, ...current])
    setCategoryCatalog((current) => {
      const known = new Set(current.map((item) => item.name))
      const additions = Array.from(new Set(imported.map((item) => item.category).filter((item) => item && !known.has(item))))
        .map((name, index) => ({ id: `local-${name}`, name, sortOrder: current.length + index, questionCount: 0 }))
      return [...current, ...additions]
    })
    setSelectedId(imported[0].id)
    if (serverReady) void questionApi.create(importer.drafts).then((payload) => {
      setQuestions((current) => [...payload.questions, ...current.filter((item) => !imported.some((created) => created.id === item.id))])
      const counts = new Map<string, number>()
      payload.questions.forEach((question) => counts.set(question.category, (counts.get(question.category) || 0) + 1))
      setCategoryCatalog((current) => current.map((item) => counts.has(item.name) ? { ...item, questionCount: item.questionCount + (counts.get(item.name) || 0) } : item))
    }).catch(() => setServerReady(false))
    setImporter(null)
  }

  const markLearning = async (nextMastery: Mastery) => {
    const current = learningQuestions[learningIndex]
    if (!current) return
    setQuestions((items) => items.map((item) => item.id === current.id ? { ...item, mastery: nextMastery } : item))
    if (serverReady) {
      try {
        await questionApi.update(current.id, { mastery: nextMastery })
        await studyApi.saveLearningProgress(current.id, nextMastery, learningSessionId)
        refreshLearningStats()
      } catch {
        setServerReady(false)
      }
    }
    setLearningReveal(false)
    const remainsInFilter = learningFilters.mastery === '全部掌握度' || learningFilters.mastery === nextMastery
    const nextLength = learningQuestions.length - (remainsInFilter ? 0 : 1)
    if (nextLength > 0) setLearningIndex((index) => Math.min(index + 1, nextLength - 1))
  }

  const startPractice = async (filters: PracticeFilters) => {
    const candidates = questions.filter((question) => (
      (filters.category === '全部分类' || question.category === filters.category)
      && (filters.difficulty === '全部难度' || question.difficulty === filters.difficulty)
      && (filters.mastery === '全部掌握度' || question.mastery === filters.mastery)
    ))
    if (!candidates.length) return
    practiceRecorder.reset()
    try {
      const payload = await studyApi.createPracticeSession(candidates.map((question) => question.id), filters)
      setPractice({ questionIds: candidates.map((question) => question.id), index: 0, sessionId: payload.session.id, answer: '', submitted: false, scoring: false, score: null, ...filters })
    } catch {
      setPractice({ questionIds: candidates.map((question) => question.id), index: 0, sessionId: crypto.randomUUID(), answer: '', submitted: false, scoring: false, score: null, ...filters })
    }
  }

  const submitPractice = async () => {
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

  const startInterview = async () => {
    if (!interviewSetup.role.trim() && !interviewSetup.jd.trim()) return
    setInterview({ session: {} as InterviewSession, turns: [], answer: '', loading: true, completing: false, report: null, error: '' })
    try {
      const payload = await interviewApi.create(interviewSetup)
      setInterview({ session: payload.session, turns: [], answer: '', loading: false, completing: false, report: null, error: '' })
    } catch (error) {
      setInterview(null)
      window.alert(error instanceof Error ? error.message : '模拟面试创建失败。')
    }
  }

  const submitInterviewTurn = async () => {
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
      interviewRecorder.reset()
    } catch (error) {
      setInterview({ ...interview, loading: false, error: error instanceof Error ? error.message : '回答保存失败。' })
    }
  }

  const completeInterview = async () => {
    if (!interview?.session.id) return
    setInterview({ ...interview, completing: true, error: '' })
    try {
      const payload = await interviewApi.complete(interview.session.id)
      setInterview({ ...interview, session: payload.session, completing: false, report: payload.report, error: '' })
    } catch (error) {
      setInterview({ ...interview, completing: false, error: error instanceof Error ? error.message : '复盘生成失败。' })
    }
  }

  const renderPage = () => {
    if (activePage === 'library') return <LibraryPage
      questions={questions} filteredQuestions={filteredQuestions} selected={selected} selectedId={selectedId}
      categories={categories} query={query} category={category} difficulty={difficulty} mastery={mastery} showAnswer={showAnswer}
      onQueryChange={setQuery} onCategoryChange={setCategory} onDifficultyChange={setDifficulty} onMasteryFilterChange={setMastery}
      onSelectQuestion={(id) => { setSelectedId(id); setShowAnswer(false) }} onShowAnswerChange={setShowAnswer}
      onUpdateMastery={updateMastery} onCreateQuestion={() => openEditor()} onEditQuestion={openEditor} onDeleteQuestion={deleteQuestion}
      onManageCategories={() => setCategoryManagerOpen(true)}
      onImportQuestions={() => setImporter({ step: 'input', source: '', category: '', drafts: [], error: '', processing: false })}
      onStartPractice={() => setActivePage('practice')}
    />

    if (activePage === 'learning') return <LearningPage
      questions={learningQuestions} index={learningIndex} revealAnswer={learningReveal}
      stats={learningStats ?? localLearningStats} filters={learningFilters} categories={categories}
      onFiltersChange={changeLearningFilters} onRevealAnswer={() => setLearningReveal(true)}
      onPrevious={() => { setLearningIndex((index) => index - 1); setLearningReveal(false) }}
      onNext={() => {
        if (learningIndex < learningQuestions.length - 1) { setLearningIndex((index) => index + 1); setLearningReveal(false) }
        else setActivePage('library')
      }}
      onMarkMastery={(nextMastery) => void markLearning(nextMastery)}
    />

    if (activePage === 'practice') return <PracticePage
      questions={questions} practice={practice} voice={practiceRecorder.state}
      onStart={(filters) => void startPractice(filters)}
      onAnswerChange={(answer) => setPractice((current) => current ? { ...current, answer } : current)}
      onStartRecording={() => void practiceRecorder.start()} onStopRecording={practiceRecorder.stop} onResetRecording={practiceRecorder.reset}
      onSubmit={() => void submitPractice()} onExit={() => { practiceRecorder.reset(); setPractice(null) }}
      onNext={() => {
        practiceRecorder.reset()
        setPractice((current) => !current || current.index >= current.questionIds.length - 1
          ? null
          : { ...current, index: current.index + 1, answer: '', submitted: false, scoring: false, score: null })
      }}
    />

    return <InterviewPage
      jobs={jobs} setup={interviewSetup} interview={interview} voice={interviewRecorder.state}
      onSetupChange={setInterviewSetup} onStart={() => void startInterview()} onOpenProfile={() => setProfileOpen(true)}
      onAnswerChange={(answer) => setInterview((current) => current ? { ...current, answer } : current)}
      onToggleRecording={() => interviewRecorder.state.recording ? interviewRecorder.stop() : void interviewRecorder.start()}
      onSubmitTurn={() => void submitInterviewTurn()} onComplete={() => void completeInterview()}
      onExit={() => { interviewRecorder.reset(); setInterview(null) }}
    />
  }

  return <div className="app-shell">
    <AppSidebar activePage={activePage} learningTodoCount={questions.filter((question) => question.mastery !== '掌握').length} serverReady={serverReady} onNavigate={setActivePage} onOpenProfile={() => setProfileOpen(true)} />
    <main className="main-content">{renderPage()}</main>
    {profileOpen && <ProfileCenter profile={profile} jobs={jobs} onProfileChange={setProfile} onJobsChange={setJobs} onClose={() => setProfileOpen(false)} />}
    {categoryManagerOpen && <CategoryManagerModal categories={categoryCatalog} onClose={() => setCategoryManagerOpen(false)} onCreate={async (name) => { await createCategory(name) }} onRename={renameCategory} onDelete={deleteCategory} />}
    {editor && <QuestionEditorModal editor={editor} onChange={setEditor} onClose={() => setEditor(null)} onSave={saveQuestion} />}
    {importer && <QuestionImportModal state={importer} categories={categories.filter((item) => item !== '全部分类')} onChange={setImporter} onClose={() => setImporter(null)} onCreateCategory={createCategory} onLocalParse={importPreview} onGenerate={() => void importWithAi()} onConfirm={confirmImport} />}
  </div>
}

export default App
