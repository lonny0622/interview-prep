import { useEffect, useMemo, useState } from 'react'
import { llmApi } from '../../api/interviewApi'
import { questionApi } from '../../api/questionApi'
import { EMPTY_QUESTION_DRAFT, QUESTION_STORAGE_KEY, SEED_QUESTIONS } from '../../constants/questions'
import { parseImportedQuestions, parseQuestionOutline } from '../questionImport'
import type { Mastery, Question, QuestionCategory, QuestionEditorState, QuestionImporterState } from '../../types/question'

function loadLocalQuestions(): Question[] {
  try {
    const saved = localStorage.getItem(QUESTION_STORAGE_KEY)
    return saved ? JSON.parse(saved) as Question[] : SEED_QUESTIONS
  } catch {
    return SEED_QUESTIONS
  }
}

export function useQuestionLibrary() {
  const [questions, setQuestions] = useState<Question[]>(loadLocalQuestions)
  const [serverReady, setServerReady] = useState(false)
  const [selectedId, setSelectedId] = useState(SEED_QUESTIONS[0].id)
  const [showAnswer, setShowAnswer] = useState(false)
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部分类')
  const [difficulty, setDifficulty] = useState('全部难度')
  const [mastery, setMastery] = useState('全部掌握度')
  const [editor, setEditor] = useState<QuestionEditorState | null>(null)
  const [importer, setImporter] = useState<QuestionImporterState | null>(null)
  const [categoryCatalog, setCategoryCatalog] = useState<QuestionCategory[]>([])
  const [categoryManagerOpen, setCategoryManagerOpen] = useState(false)

  useEffect(() => {
    localStorage.setItem(QUESTION_STORAGE_KEY, JSON.stringify(questions))
  }, [questions])

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

  const selected = questions.find((question) => question.id === selectedId) ?? questions[0]
  const categories = ['全部分类', ...new Set([...categoryCatalog.map((item) => item.name), ...questions.map((question) => question.category)])]
  const filteredQuestions = useMemo(() => questions.filter((question) => {
    const haystack = [question.title, question.category, question.answer, question.explanation, question.interviewAnswer, ...question.followUps].join('\n').toLowerCase()
    return haystack.includes(query.toLowerCase())
      && (category === '全部分类' || question.category === category)
      && (difficulty === '全部难度' || question.difficulty === difficulty)
      && (mastery === '全部掌握度' || question.mastery === mastery)
  }), [category, difficulty, mastery, query, questions])

  const updateMastery = (questionId: string, nextMastery: Mastery) => {
    setQuestions((current) => current.map((question) => question.id === questionId ? { ...question, mastery: nextMastery } : question))
    if (serverReady) questionApi.update(questionId, { mastery: nextMastery }).catch(() => setServerReady(false))
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

  return {
    questions, setQuestions, serverReady, setServerReady,
    selected, selectedId, showAnswer, query, category, difficulty, mastery,
    categories, filteredQuestions, editor, importer, categoryCatalog, categoryManagerOpen,
    setShowAnswer, setQuery, setCategory, setDifficulty, setMastery, setEditor, setImporter,
    setCategoryManagerOpen, setSelectedId, updateMastery, openEditor, createCategory,
    renameCategory, deleteCategory, saveQuestion, deleteQuestion, importPreview, importWithAi, confirmImport,
  }
}
