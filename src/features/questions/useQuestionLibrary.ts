import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { llmApi } from '../../api/interviewApi'
import { questionApi } from '../../api/questionApi'
import { studyApi } from '../../api/studyApi'
import { EMPTY_QUESTION_DRAFT, QUESTION_IMPORT_STORAGE_KEY, QUESTION_STORAGE_KEY, QUESTION_VIEW_STORAGE_KEY, SEED_QUESTIONS } from '../../constants/questions'
import { parseImportedQuestions, parseQuestionOutline, sanitizeGeneratedAnswer } from '../questionImport'
import { normalizeFollowUps } from '../followUps'
import type { FollowUpAnswerEditorState, Mastery, Question, QuestionCategory, QuestionDraft, QuestionEditorState, QuestionImporterState, QuestionRegeneratorState } from '../../types/question'

const normalizeQuestion = (question: Question): Question => ({ ...question, followUps: normalizeFollowUps(question.followUps) })
const normalizeDraft = (draft: QuestionDraft): QuestionDraft => ({ ...draft, answer: sanitizeGeneratedAnswer(draft.answer), followUps: normalizeFollowUps(draft.followUps) })

function loadLocalQuestions(): Question[] {
  try {
    const saved = localStorage.getItem(QUESTION_STORAGE_KEY)
    const questions = saved ? JSON.parse(saved) as Question[] : SEED_QUESTIONS
    return Array.isArray(questions) ? questions.map(normalizeQuestion) : SEED_QUESTIONS
  } catch {
    return SEED_QUESTIONS
  }
}

function loadQuestionImporter(): QuestionImporterState | null {
  try {
    const saved = localStorage.getItem(QUESTION_IMPORT_STORAGE_KEY)
    if (!saved) return null
    const importer = JSON.parse(saved) as QuestionImporterState
    if (!importer || typeof importer.source !== 'string' || !Array.isArray(importer.drafts)) return null
    const normalized = { ...importer, drafts: importer.drafts.map(normalizeDraft) }
    return importer.processing
      ? { ...normalized, processing: false, error: '上次生成被页面刷新中断，已保留进度，可继续生成剩余题目。' }
      : normalized
  } catch {
    return null
  }
}

type QuestionViewState = {
  selectedId: string
  query: string
  category: string
  difficulty: string
  mastery: string
}

function buildCategoryGenerationContext(sourceQuestions: Question[], instructions = ''): string {
  const category = sourceQuestions[0]?.category || '未分类'
  const relatedTitles = sourceQuestions.slice(0, 30).map((question) => `- ${question.title}`).join('\n')
  return [
    `目标分类：${category}。分类是解释题目术语的首要语境；遇到“缓存”“线程”“桥接”等跨领域词时，必须优先按「${category}」领域回答，不得擅自切换到 React 状态、浏览器或其他无关语境。`,
    relatedTitles ? `本次同分类题目：\n${relatedTitles}` : '',
    instructions.trim() ? `用户补充的生成要求：\n${instructions.trim()}` : '',
  ].filter(Boolean).join('\n\n')
}

function loadQuestionView(): QuestionViewState {
  const fallback = { selectedId: SEED_QUESTIONS[0].id, query: '', category: '全部分类', difficulty: '全部难度', mastery: '全部掌握度' }
  try {
    const value = JSON.parse(localStorage.getItem(QUESTION_VIEW_STORAGE_KEY) || '{}') as Partial<QuestionViewState>
    return {
      selectedId: typeof value.selectedId === 'string' ? value.selectedId : fallback.selectedId,
      query: typeof value.query === 'string' ? value.query.slice(0, 200) : fallback.query,
      category: typeof value.category === 'string' ? value.category : fallback.category,
      difficulty: ['全部难度', '简单', '中等', '困难'].includes(String(value.difficulty)) ? String(value.difficulty) : fallback.difficulty,
      mastery: ['全部掌握度', '未学习', '了解', '熟悉', '掌握'].includes(String(value.mastery)) ? String(value.mastery) : fallback.mastery,
    }
  } catch {
    return fallback
  }
}

export function useQuestionLibrary() {
  const [initialView] = useState(loadQuestionView)
  const [questions, setQuestions] = useState<Question[]>(loadLocalQuestions)
  const [serverReady, setServerReady] = useState(false)
  const [selectedId, setSelectedId] = useState(initialView.selectedId)
  const [showAnswer, setShowAnswer] = useState(false)
  const [query, setQuery] = useState(initialView.query)
  const [category, setCategory] = useState(initialView.category)
  const [difficulty, setDifficulty] = useState(initialView.difficulty)
  const [mastery, setMastery] = useState(initialView.mastery)
  const [editor, setEditor] = useState<QuestionEditorState | null>(null)
  const [importer, setImporter] = useState<QuestionImporterState | null>(loadQuestionImporter)
  const [regenerator, setRegenerator] = useState<QuestionRegeneratorState | null>(null)
  const [followUpEditor, setFollowUpEditor] = useState<FollowUpAnswerEditorState | null>(null)
  const [categoryCatalog, setCategoryCatalog] = useState<QuestionCategory[]>([])
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)
  const importAbortController = useRef<AbortController | null>(null)
  const regenerateAbortController = useRef<AbortController | null>(null)
  const importerCleanupDone = useRef(false)

  const refreshFromServer = useCallback(() => questionApi.list().then((payload) => {
    const normalized = payload.questions.map(normalizeQuestion)
    setQuestions(normalized)
    setSelectedId((current) => normalized.some((question) => question.id === current) ? current : normalized[0]?.id ?? '')
    setServerReady(true)
    return true
  }).catch(() => {
    setServerReady(false)
    return false
  }), [])

  useEffect(() => {
    localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify(questions))
  }, [questions])

  useEffect(() => {
    localStorage.setItem(QUESTION_VIEW_STORAGE_KEY, JSON.stringify({ selectedId, query, category, difficulty, mastery }))
  }, [category, difficulty, mastery, query, selectedId])

  useEffect(() => {
    if (importer) localStorage.setItem(QUESTION_IMPORT_STORAGE_KEY, JSON.stringify(importer))
    else localStorage.removeItem(QUESTION_IMPORT_STORAGE_KEY)
  }, [importer])

  useEffect(() => {
    if (!importer || importerCleanupDone.current) return
    importerCleanupDone.current = true
    const drafts = importer.drafts.map(normalizeDraft)
    if (drafts.some((draft, index) => draft.answer !== importer.drafts[index]?.answer)) setImporter({ ...importer, drafts })
  }, [importer])

  useEffect(() => { void refreshFromServer() }, [refreshFromServer])

  useEffect(() => {
    if (serverReady) return
    const timer = window.setInterval(() => { void refreshFromServer() }, 15_000)
    return () => window.clearInterval(timer)
  }, [refreshFromServer, serverReady])

  useEffect(() => {
    questionApi.categories().then((payload) => setCategoryCatalog(payload.categories)).catch(() => {})
  }, [])

  const selected = questions.find((question) => question.id === selectedId) ?? questions[0]
  const categories = ['全部分类', ...new Set([...categoryCatalog.map((item) => item.name), ...questions.map((question) => question.category)])]
  const filteredQuestions = useMemo(() => questions.filter((question) => {
    const haystack = [question.title, question.category, question.answer, question.explanation, question.interviewAnswer, ...question.followUps.flatMap((item) => [item.question, item.answer])].join('\n').toLowerCase()
    return haystack.includes(query.toLowerCase())
      && (category === '全部分类' || question.category === category)
      && (difficulty === '全部难度' || question.difficulty === difficulty)
      && (mastery === '全部掌握度' || question.mastery === mastery)
  }), [category, difficulty, mastery, query, questions])

  const updateMastery = async (questionId: string, nextMastery: Mastery) => {
    try {
      await studyApi.saveLearningProgress(questionId, nextMastery, null)
      setQuestions((current) => current.map((item) => item.id === questionId ? { ...item, mastery: nextMastery } : item))
      setServerReady(true)
      return true
    } catch {
      setServerReady(false)
      window.alert('保存失败，SQLite 服务暂不可用；本次修改未写入。')
      return false
    }
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

  const moveCategoryQuestions = async (source: QuestionCategory, targetId: string) => {
    const result = await questionApi.moveCategoryQuestions(source.id, targetId)
    setCategoryCatalog((current) => current.map((item) => {
      if (item.id === result.source.id) return result.source
      if (item.id === result.target.id) return result.target
      return item
    }))
    setQuestions((current) => current.map((question) => question.category.toLocaleLowerCase() === source.name.toLocaleLowerCase()
      ? { ...question, category: result.target.name }
      : question))
    setCategory((current) => current === source.name ? result.target.name : current)
  }

  const registerCategoryLocally = (name: string) => {
    const normalized = name.trim()
    if (!normalized) return
    setCategoryCatalog((current) => current.some((item) => item.name === normalized)
      ? current
      : [...current, { id: `local-${normalized}`, name: normalized, sortOrder: current.length, questionCount: 0 }])
  }

  const saveQuestion = async () => {
    if (!editor || !editor.draft.title.trim() || !editor.draft.category.trim()) return
    try {
      if (editor.mode === 'edit' && selected) {
        const { question } = await questionApi.update(selected.id, editor.draft)
        setQuestions((current) => current.map((item) => item.id === selected.id ? question : item))
        registerCategoryLocally(question.category)
      } else {
        const { questions: created } = await questionApi.create([editor.draft])
        const question = created[0]
        if (question) {
          setQuestions((current) => [question, ...current])
          setSelectedId(question.id)
          registerCategoryLocally(question.category)
        }
      }
      setServerReady(true)
      setEditor(null)
    } catch {
      setServerReady(false)
      window.alert('保存失败，SQLite 服务暂不可用；编辑内容仍保留在窗口中。')
    }
  }

  const deleteQuestion = async () => {
    if (!selected || !window.confirm('确认删除这道题目？此操作无法撤销。')) return
    try {
      await questionApi.remove(selected.id)
      const nextQuestions = questions.filter((question) => question.id !== selected.id)
      setQuestions(nextQuestions)
      setSelectedId(nextQuestions[0]?.id ?? '')
      setServerReady(true)
    } catch {
      setServerReady(false)
      window.alert('删除失败，SQLite 服务暂不可用；题目未删除。')
    }
  }

  const openFollowUpAnswer = (question: Question, followUpIndex: number) => {
    const followUp = question.followUps[followUpIndex]
    if (!followUp) return
    setFollowUpEditor({ questionId: question.id, followUpIndex, answer: followUp.answer, supplementalInfo: '', generating: false, saving: false, error: '' })
  }

  const generateFollowUpAnswer = async () => {
    if (!followUpEditor || followUpEditor.generating || followUpEditor.saving) return
    const question = questions.find((item) => item.id === followUpEditor.questionId)
    const followUp = question?.followUps[followUpEditor.followUpIndex]
    if (!question || !followUp) return
    setFollowUpEditor({ ...followUpEditor, generating: true, error: '' })
    try {
      const payload = await llmApi.generateFollowUpAnswer({ question, followUpQuestion: followUp.question, supplementalInfo: followUpEditor.supplementalInfo })
      setFollowUpEditor((current) => current ? { ...current, answer: payload.answer, generating: false, error: '' } : current)
    } catch (error) {
      setFollowUpEditor((current) => current ? { ...current, generating: false, error: error instanceof Error ? error.message : '追问回答生成失败。' } : current)
    }
  }

  const saveFollowUpAnswer = async () => {
    if (!followUpEditor || !followUpEditor.answer.trim() || followUpEditor.generating || followUpEditor.saving) return
    const question = questions.find((item) => item.id === followUpEditor.questionId)
    if (!question?.followUps[followUpEditor.followUpIndex]) return
    const followUps = question.followUps.map((item, index) => index === followUpEditor.followUpIndex ? { ...item, answer: followUpEditor.answer.trim() } : item)
    setFollowUpEditor({ ...followUpEditor, saving: true, error: '' })
    try {
      const payload = await questionApi.update(question.id, { followUps })
      const updated = normalizeQuestion(payload.question)
      setQuestions((current) => current.map((item) => item.id === updated.id ? updated : item))
      setServerReady(true)
      setFollowUpEditor(null)
    } catch (error) {
      setServerReady(false)
      setFollowUpEditor((current) => current ? { ...current, saving: false, error: error instanceof Error ? error.message : '追问回答保存失败。' } : current)
    }
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
    const source = String(importer?.source || '')
    const selectedCategory = String(importer?.category || '')
    if (!source.trim() || !importer) return
    let outline
    try {
      outline = parseQuestionOutline(source, selectedCategory)
    } catch (error) {
      setImporter({ ...importer, error: error instanceof Error ? error.message : '题目列表解析失败。' })
      return
    }
    if (!outline.questions.length) {
      setImporter({ ...importer, error: '没有识别到题目。请每行写一道题，并用 ⭐ Level 1/2/3 标记难度。' })
      return
    }
    const existingDrafts = importer.step === 'preview'
      && importer.drafts.every((draft, index) => draft.title === outline.questions[index]?.title)
      ? importer.drafts.map(normalizeDraft)
      : []
    if (existingDrafts.length >= outline.questions.length) {
      setImporter({ ...importer, processing: false, error: '', progress: { completed: existingDrafts.length, total: outline.questions.length } })
      return
    }
    importAbortController.current?.abort()
    const controller = new AbortController()
    importAbortController.current = controller
    setImporter({ ...importer, step: 'preview', category: outline.category, drafts: existingDrafts, processing: true, progress: { completed: existingDrafts.length, total: outline.questions.length }, error: '' })
    try {
      const payload = await llmApi.enrichQuestions(
        {
          category: outline.category,
          questions: outline.questions.slice(existingDrafts.length),
          context: [
            `目标分类：${outline.category}。分类是解释每道题的首要语境，答案必须直接回应题目，不得因同名术语切换到其他技术领域。`,
            `原始导入材料：\n${source}`,
          ].join('\n\n'),
        },
        (progress) => setImporter((current) => current ? {
          ...current,
          drafts: [...existingDrafts, ...progress.drafts.map(normalizeDraft)],
          progress: { completed: existingDrafts.length + progress.completed, total: outline.questions.length, status: progress.status, retrying: progress.retrying },
        } : current),
        controller.signal,
      )
      const completeDrafts = [...existingDrafts, ...payload.drafts.map(normalizeDraft)]
      if (completeDrafts.length !== outline.questions.length) throw new Error('AI 返回的题目数量不完整，请继续生成。')
      setImporter({ step: 'preview', source, category: outline.category, drafts: completeDrafts, error: '', processing: false, progress: { completed: completeDrafts.length, total: outline.questions.length } })
    } catch (error) {
      if (controller.signal.aborted) return
      const message = error instanceof Error ? error.message : 'AI 解析失败。'
      setImporter((current) => current ? { ...current, processing: false, error: /JSON|Unexpected token|格式/.test(message) ? '模型返回格式不完整，系统已自动重试；仍失败时请再次点击生成。' : message } : current)
    } finally {
      if (importAbortController.current === controller) importAbortController.current = null
    }
  }

  const closeImporter = () => {
    importAbortController.current?.abort()
    importAbortController.current = null
    setImporter(null)
  }

  const confirmImport = async () => {
    if (!importer?.drafts.length) return
    const incomplete = importer.drafts.filter((draft) => !draft.title.trim() || !draft.answer.trim() || !draft.explanation.trim() || !draft.interviewAnswer.trim())
    if (incomplete.length) {
      setImporter({ ...importer, error: `还有 ${incomplete.length} 道题目的答案、解析或建议回答为空，请补充后再导入。` })
      return
    }
    setImporter({ ...importer, processing: true, error: '' })
    try {
      const payload = await questionApi.create(importer.drafts)
      setQuestions((current) => [...payload.questions, ...current])
      const counts = new Map<string, number>()
      payload.questions.forEach((question) => counts.set(question.category, (counts.get(question.category) || 0) + 1))
      setCategoryCatalog((current) => {
        const known = new Set(current.map((item) => item.name))
        const additions = Array.from(counts.keys()).filter((name) => !known.has(name))
          .map((name, index) => ({ id: `local-${name}`, name, sortOrder: current.length + index, questionCount: counts.get(name) || 0 }))
        return [...current.map((item) => counts.has(item.name) ? { ...item, questionCount: item.questionCount + (counts.get(item.name) || 0) } : item), ...additions]
      })
      setSelectedId(payload.questions[0]?.id ?? selectedId)
      setServerReady(true)
      setImporter(null)
    } catch (error) {
      setServerReady(false)
      setImporter((current) => current ? { ...current, processing: false, error: error instanceof Error ? error.message : '写入 SQLite 失败，请重试。' } : current)
    }
  }

  const runRegeneration = async (sourceQuestions: Question[], existingDrafts: QuestionDraft[], instructions = '') => {
    if (!sourceQuestions.length || existingDrafts.length >= sourceQuestions.length) return
    regenerateAbortController.current?.abort()
    const controller = new AbortController()
    regenerateAbortController.current = controller
    setRegenerator((current) => current ? { ...current, drafts: existingDrafts, awaitingInstructions: false, processing: true, saving: false, error: '', progress: { completed: existingDrafts.length, total: sourceQuestions.length } } : current)
    try {
      const payload = await llmApi.enrichQuestions(
        {
          category: sourceQuestions[0].category,
          questions: sourceQuestions.slice(existingDrafts.length).map((question) => ({ title: question.title, difficulty: question.difficulty })),
          context: buildCategoryGenerationContext(sourceQuestions, instructions),
        },
        (progress) => setRegenerator((current) => current ? {
          ...current,
          drafts: [...existingDrafts, ...progress.drafts.map(normalizeDraft)],
          progress: { completed: existingDrafts.length + progress.completed, total: sourceQuestions.length, status: progress.status, retrying: progress.retrying },
        } : current),
        controller.signal,
      )
      const completeDrafts = [...existingDrafts, ...payload.drafts.map(normalizeDraft)]
      if (completeDrafts.length !== sourceQuestions.length) throw new Error('AI 返回的题目数量不完整，请继续生成。')
      setRegenerator((current) => current ? { ...current, drafts: completeDrafts, processing: false, error: '', progress: { completed: completeDrafts.length, total: sourceQuestions.length } } : current)
    } catch (error) {
      if (controller.signal.aborted) return
      setRegenerator((current) => current ? { ...current, processing: false, error: error instanceof Error ? error.message : '重新生成失败。' } : current)
    } finally {
      if (regenerateAbortController.current === controller) regenerateAbortController.current = null
    }
  }

  const startRegeneration = (sourceQuestions: Question[], scopeLabel: string, awaitingInstructions = false) => {
    if (!sourceQuestions.length) return
    setRegenerator({ questions: sourceQuestions, drafts: [], scopeLabel, instructions: '', awaitingInstructions, processing: !awaitingInstructions, saving: false, error: '', progress: { completed: 0, total: sourceQuestions.length } })
    if (!awaitingInstructions) void runRegeneration(sourceQuestions, [])
  }

  const regenerateSingleQuestion = (question: Question) => startRegeneration([question], `单题 · ${question.title}`, true)

  const regenerateCategory = (categoryToRegenerate: QuestionCategory) => {
    const sourceQuestions = questions.filter((question) => question.category.toLocaleLowerCase() === categoryToRegenerate.name.toLocaleLowerCase())
    if (!sourceQuestions.length) return
    if (!window.confirm(`将为“${categoryToRegenerate.name}”分类下的 ${sourceQuestions.length} 道题重新生成内容。生成完成并确认后才会覆盖原内容，是否继续？`)) return
    setCategoryManagerOpen(false)
    startRegeneration(sourceQuestions, `分类 · ${categoryToRegenerate.name}`)
  }

  const continueRegeneration = () => {
    if (!regenerator) return
    void runRegeneration(regenerator.questions, regenerator.drafts, regenerator.instructions)
  }

  const beginRegeneration = () => {
    if (!regenerator || !regenerator.awaitingInstructions) return
    void runRegeneration(regenerator.questions, [], regenerator.instructions)
  }

  const closeRegenerator = () => {
    regenerateAbortController.current?.abort()
    regenerateAbortController.current = null
    setRegenerator(null)
  }

  const confirmRegeneration = async () => {
    if (!regenerator || regenerator.processing || regenerator.drafts.length !== regenerator.questions.length) return
    setRegenerator({ ...regenerator, saving: true, error: '' })
    try {
      const updates = regenerator.questions.map((question, index) => {
        const draft = regenerator.drafts[index]
        if (!draft?.answer.trim() || !draft.explanation.trim() || !draft.interviewAnswer.trim()) throw new Error(`题目“${question.title}”的生成内容不完整。`)
        return {
          id: question.id,
          importance: draft.importance,
          answer: sanitizeGeneratedAnswer(draft.answer),
          explanation: draft.explanation,
          interviewAnswer: draft.interviewAnswer,
          followUps: draft.followUps,
        }
      })
      const payload = await questionApi.replaceGeneratedContent(updates)
      const replacements = new Map(payload.questions.map((question) => [question.id, question]))
      setQuestions((current) => current.map((question) => replacements.get(question.id) ?? question))
      setShowAnswer(true)
      setRegenerator(null)
    } catch (error) {
      setRegenerator((current) => current ? { ...current, saving: false, error: error instanceof Error ? error.message : '保存生成内容失败。' } : current)
    }
  }

  return {
    questions, setQuestions, serverReady, setServerReady,
    selected, selectedId, showAnswer, query, category, difficulty, mastery,
    categories, filteredQuestions, editor, importer, regenerator, followUpEditor, categoryCatalog, categoryManagerOpen,
    setShowAnswer, setQuery, setCategory, setDifficulty, setMastery, setEditor, setImporter,
    setCategoryManagerOpen, setSelectedId, updateMastery, openEditor, createCategory,
    setFollowUpEditor, openFollowUpAnswer, generateFollowUpAnswer, saveFollowUpAnswer,
    renameCategory, deleteCategory, moveCategoryQuestions, saveQuestion, deleteQuestion, importPreview, importWithAi, closeImporter, confirmImport,
    setRegenerator, regenerateSingleQuestion, regenerateCategory, beginRegeneration, continueRegeneration, closeRegenerator, confirmRegeneration,
  }
}
