import { useEffect, useMemo, useRef, useState } from 'react'
import { ArrowLeft, ArrowRight, BookOpen, BrainCircuit, Check, ChevronDown, ChevronUp, CircleDot, FilePenLine, FileUp, ListFilter, Mic2, MoreHorizontal, Plus, Search, Settings, Sparkles, Trash2, Upload, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { llmConfig, llmStatus } from './config/llm'
import './App.css'

type Difficulty = '简单' | '中等' | '困难'
type Mastery = '未学习' | '了解' | '熟悉' | '掌握'

type Question = {
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

type QuestionDraft = Omit<Question, 'id' | 'mastery'>
type ScoreResult = { score: number; dimensions?: Record<string, number>; strengths: string[]; gaps: string[]; betterAnswer: string; source?: string; fallbackReason?: string }
type VoiceState = { recording: boolean; transcribing: boolean; audioUrl: string; error: string }
const STORAGE_KEY = 'interview-prep.questions.v1'

const seedQuestions: Question[] = [
  {
    id: 'q-1',
    title: 'React 中为什么需要 key？key 变化时会发生什么？',
    category: 'React',
    difficulty: '中等',
    importance: 5,
    mastery: '熟悉',
    answer: 'key 用来标识列表中的稳定身份，帮助 React 在协调阶段复用正确的 Fiber。',
    explanation: 'key 参与 Diff。稳定且唯一的 key 可以让节点在位置变化时保持状态；使用 index 作为 key，在插入、删除或排序时可能造成状态错位。',
    interviewAnswer: '我会先说明 key 是列表项的身份标识，再结合列表插入和组件状态错位的例子解释为什么不建议随意使用 index。',
    followUps: ['什么时候 index 可以作为 key？', 'key 变化为什么会导致组件重新挂载？'],
  },
  {
    id: 'q-2',
    title: '如何定位前端页面的性能瓶颈？',
    category: '性能优化',
    difficulty: '困难',
    importance: 5,
    mastery: '了解',
    answer: '先定义指标和用户感知，再通过 Performance、Network 和 React Profiler 分层定位。',
    explanation: '不要一开始就改代码。先区分加载、运行时和交互响应问题，建立基线后再验证资源体积、长任务、渲染次数和接口瀑布等假设。',
    interviewAnswer: '我会按指标、采样、假设、验证四步讲，并给出一个真实项目中从长任务定位到组件拆分的例子。',
    followUps: ['LCP 和 INP 分别反映什么？', '如何避免优化后引入新的问题？'],
  },
  {
    id: 'q-3',
    title: '项目中遇到过最棘手的线上问题是什么？',
    category: '项目题',
    difficulty: '中等',
    importance: 4,
    mastery: '未学习',
    answer: '用 STAR 结构回答：背景、任务、行动、结果，并明确个人贡献。',
    explanation: '重点不在于把事故讲得多严重，而在于说明你如何定位问题、如何做取舍，以及最后有没有留下监控或流程改进。',
    interviewAnswer: '我会控制在两分钟内，先交代影响范围，再讲定位过程和关键决策，最后量化结果和后续改进。',
    followUps: ['如果重新做一次，你会改变什么？'],
  },
]

const navItems = [
  { id: 'library', label: '题库', icon: BookOpen },
  { id: 'learning', label: '学习', icon: BrainCircuit },
  { id: 'practice', label: '刷题', icon: CircleDot },
  { id: 'interview', label: '模拟面试', icon: Mic2 },
]

const emptyDraft: QuestionDraft = { title: '', category: '', difficulty: '中等', importance: 3, answer: '', explanation: '', interviewAnswer: '', followUps: [] }

const masteryOrder: Mastery[] = ['未学习', '了解', '熟悉', '掌握']

function parseImportedQuestions(source: string): QuestionDraft[] {
  const trimmed = source.trim()
  if (!trimmed) return []
  try {
    const parsed = JSON.parse(trimmed)
    const items = Array.isArray(parsed) ? parsed : parsed.questions
    if (!Array.isArray(items)) throw new Error('JSON 顶层需要是数组，或包含 questions 数组。')
    return items.map((item) => ({
      title: String(item.title ?? item.question ?? '').trim(),
      category: String(item.category ?? '未分类').trim(),
      difficulty: (['简单', '中等', '困难'].includes(item.difficulty) ? item.difficulty : '中等') as Difficulty,
      importance: Math.min(5, Math.max(1, Number(item.importance) || 3)),
      answer: String(item.answer ?? item.answer_md ?? '').trim(),
      explanation: String(item.explanation ?? item.explanation_md ?? '').trim(),
      interviewAnswer: String(item.interviewAnswer ?? item.interview_answer ?? '').trim(),
      followUps: Array.isArray(item.followUps ?? item.follow_up_questions) ? (item.followUps ?? item.follow_up_questions).map(String).filter(Boolean) : [],
    })).filter((item) => item.title)
  } catch (error) {
    if (trimmed.startsWith('{') || trimmed.startsWith('[')) throw error
  }

  return trimmed.split(/\n(?=---\s*$|##\s+)/gm).map((block) => {
    const title = block.match(/^##\s+(.+)$/m)?.[1]?.trim() ?? block.match(/^#\s+(.+)$/m)?.[1]?.trim() ?? ''
    const value = (label: string) => block.match(new RegExp(`^${label}[:：]\\s*(.+)$`, 'mi'))?.[1]?.trim() ?? ''
    const section = (heading: string) => block.match(new RegExp(`###\\s+${heading}\\s*\\n([\\s\\S]*?)(?=\\n###|$)`, 'i'))?.[1]?.trim() ?? ''
    const followUps = section('发散问题').split('\n').map((line) => line.replace(/^[-*]\s*/, '').trim()).filter(Boolean)
    return {
      title,
      category: value('分类') || '未分类',
      difficulty: (['简单', '中等', '困难'].includes(value('难度')) ? value('难度') : '中等') as Difficulty,
      importance: Math.min(5, Math.max(1, Number(value('重要性')) || 3)),
      answer: section('答案'),
      explanation: section('详细解析|解析'),
      interviewAnswer: section('面试时建议的回答|建议回答'),
      followUps,
    }
  }).filter((item) => item.title)
}

function App() {
  const [questions, setQuestions] = useState<Question[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY)
      return saved ? JSON.parse(saved) : seedQuestions
    } catch {
      return seedQuestions
    }
  })
  const [activeNav, setActiveNav] = useState('library')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部分类')
  const [mastery, setMastery] = useState('全部掌握度')
  const [selectedId, setSelectedId] = useState(seedQuestions[0].id)
  const [showAnswer, setShowAnswer] = useState(false)
  const [editor, setEditor] = useState<{ mode: 'create' | 'edit'; draft: QuestionDraft } | null>(null)
  const [importer, setImporter] = useState<{ step: 'input' | 'preview'; source: string; drafts: QuestionDraft[]; error: string; processing: boolean } | null>(null)
  const [learningIndex, setLearningIndex] = useState(0)
  const [learningReveal, setLearningReveal] = useState(false)
  const [serverReady, setServerReady] = useState(false)
  const [learningSessionId, setLearningSessionId] = useState<string | null>(null)
  const [practice, setPractice] = useState<{ questionIds: string[]; index: number; sessionId: string; answer: string; submitted: boolean; scoring: boolean; score: ScoreResult | null; category: string; difficulty: string; mastery: string } | null>(null)
  const [voice, setVoice] = useState<VoiceState>({ recording: false, transcribing: false, audioUrl: '', error: '' })
  const mediaRecorderRef = useRef<MediaRecorder | null>(null)
  const audioChunksRef = useRef<Blob[]>([])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(questions))
  }, [questions])

  useEffect(() => {
    fetch('/api/questions')
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('题库服务不可用')))
      .then((payload: { questions: Question[] }) => {
        if (Array.isArray(payload.questions)) {
          setQuestions(payload.questions)
          setSelectedId(payload.questions[0]?.id ?? '')
          setServerReady(true)
        }
      })
      .catch(() => setServerReady(false))
  }, [])

  useEffect(() => {
    if (activeNav !== 'learning' || !serverReady || learningSessionId || !questions.length) return
    fetch('/api/learning-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionIds: questions.map((question) => question.id) }) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error('学习 session 创建失败')))
      .then((payload: { session: { id: string } }) => setLearningSessionId(payload.session.id))
      .catch(() => setServerReady(false))
  }, [activeNav, learningSessionId, questions, serverReady])

  const selected = questions.find((question) => question.id === selectedId) ?? questions[0]
  const categories = ['全部分类', ...new Set(questions.map((question) => question.category))]
  const filteredQuestions = useMemo(
    () => questions.filter((question) => {
      const matchesQuery = question.title.toLowerCase().includes(query.toLowerCase())
      const matchesCategory = category === '全部分类' || question.category === category
      const matchesMastery = mastery === '全部掌握度' || question.mastery === mastery
      return matchesQuery && matchesCategory && matchesMastery
    }),
    [category, mastery, query, questions],
  )

  const updateMastery = (nextMastery: Mastery) => {
    setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, mastery: nextMastery } : question))
    if (serverReady && selected) fetch(`/api/questions/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mastery: nextMastery }) }).catch(() => setServerReady(false))
  }

  const openEditor = (question?: Question) => {
    setEditor(question ? {
      mode: 'edit',
      draft: { title: question.title, category: question.category, difficulty: question.difficulty, importance: question.importance, answer: question.answer, explanation: question.explanation, interviewAnswer: question.interviewAnswer, followUps: question.followUps },
    } : { mode: 'create', draft: emptyDraft })
  }

  const saveQuestion = () => {
    if (!editor || !editor.draft.title.trim() || !editor.draft.category.trim()) return
    if (editor.mode === 'edit') {
      setQuestions((current) => current.map((question) => question.id === selected.id ? { ...question, ...editor.draft } : question))
      if (serverReady) fetch(`/api/questions/${selected.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(editor.draft) }).catch(() => setServerReady(false))
    } else {
      const nextQuestion: Question = { ...editor.draft, id: crypto.randomUUID(), mastery: '未学习' }
      setQuestions((current) => [nextQuestion, ...current])
      setSelectedId(nextQuestion.id)
      if (serverReady) fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions: [editor.draft] }) }).then(async (response) => { if (!response.ok) throw new Error('题目保存失败'); const payload = await response.json(); if (payload.questions?.[0]) setQuestions((current) => [payload.questions[0], ...current.filter((item) => item.id !== nextQuestion.id)]) }).catch(() => setServerReady(false))
    }
    setEditor(null)
  }

  const deleteQuestion = () => {
    if (!selected || !window.confirm('确认删除这道题目？此操作无法撤销。')) return
    const nextQuestions = questions.filter((question) => question.id !== selected.id)
    setQuestions(nextQuestions)
    setSelectedId(nextQuestions[0]?.id ?? '')
    if (serverReady) fetch(`/api/questions/${selected.id}`, { method: 'DELETE' }).catch(() => setServerReady(false))
  }

  const learningQuestions = useMemo(() => [...questions].sort((a, b) => {
    const masteryDelta = masteryOrder.indexOf(a.mastery) - masteryOrder.indexOf(b.mastery)
    return masteryDelta || b.importance - a.importance
  }), [questions])

  const importPreview = () => {
    if (!importer) return
    try {
      const drafts = parseImportedQuestions(importer.source)
      if (!drafts.length) throw new Error('没有解析到有效题目，请检查格式。')
      setImporter({ ...importer, step: 'preview', drafts, error: '' })
    } catch (error) {
      setImporter({ ...importer, error: error instanceof Error ? error.message : '导入内容无法解析。' })
    }
  }

  const importWithAi = async () => {
    if (!importer?.source.trim()) return
    setImporter({ ...importer, processing: true, error: '' })
    try {
      const response = await fetch('/api/llm/parse-questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ source: importer.source }), signal: AbortSignal.timeout(95_000) })
      const payload = await response.json()
      if (!response.ok) throw new Error(payload.error || 'AI 解析失败。')
      if (!Array.isArray(payload.drafts) || payload.drafts.length === 0) throw new Error('AI 没有返回有效题目。')
      setImporter({ step: 'preview', source: importer.source, drafts: payload.drafts, error: '', processing: false })
    } catch (error) {
      setImporter({ ...importer, processing: false, error: error instanceof Error ? error.message : 'AI 解析失败。' })
    }
  }

  const confirmImport = () => {
    if (!importer?.drafts.length) return
    const imported = importer.drafts.map((draft) => ({ ...draft, id: crypto.randomUUID(), mastery: '未学习' as Mastery }))
    setQuestions((current) => [...imported, ...current])
    setSelectedId(imported[0].id)
    if (serverReady) fetch('/api/questions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questions: importer.drafts }) }).then(async (response) => { if (!response.ok) throw new Error('批量保存失败'); const payload = await response.json(); setQuestions((current) => [...(payload.questions || []), ...current.filter((item) => !imported.some((created) => created.id === item.id))]) }).catch(() => setServerReady(false))
    setImporter(null)
  }

  const markLearning = (nextMastery: Mastery) => {
    const current = learningQuestions[learningIndex]
    if (!current) return
    setQuestions((items) => items.map((item) => item.id === current.id ? { ...item, mastery: nextMastery } : item))
    if (serverReady) fetch(`/api/questions/${current.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ mastery: nextMastery }) }).catch(() => setServerReady(false))
    setLearningReveal(false)
    if (learningIndex < learningQuestions.length - 1) setLearningIndex((index) => index + 1)
  }

  const startPractice = async (filters: { category: string; difficulty: string; mastery: string }) => {
    const candidates = questions.filter((question) => (filters.category === '全部分类' || question.category === filters.category) && (filters.difficulty === '全部难度' || question.difficulty === filters.difficulty) && (filters.mastery === '全部掌握度' || question.mastery === filters.mastery))
    if (!candidates.length) return
    try {
      const response = await fetch('/api/practice-sessions', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ questionIds: candidates.map((question) => question.id), filters }) })
      const payload = await response.json()
      setPractice({ questionIds: candidates.map((question) => question.id), index: 0, sessionId: payload.session?.id || crypto.randomUUID(), answer: '', submitted: false, scoring: false, score: null, ...filters })
      setVoice({ recording: false, transcribing: false, audioUrl: '', error: '' })
    } catch {
      setPractice({ questionIds: candidates.map((question) => question.id), index: 0, sessionId: crypto.randomUUID(), answer: '', submitted: false, scoring: false, score: null, ...filters })
      setVoice({ recording: false, transcribing: false, audioUrl: '', error: '' })
    }
  }

  const startRecording = async () => {
    if (!practice || voice.recording || !navigator.mediaDevices?.getUserMedia) {
      setVoice((current) => ({ ...current, error: '当前浏览器不支持录音，请使用文字回答。' }))
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const recorder = new MediaRecorder(stream)
      audioChunksRef.current = []
      recorder.ondataavailable = (event) => { if (event.data.size) audioChunksRef.current.push(event.data) }
      recorder.onstop = async () => {
        stream.getTracks().forEach((track) => track.stop())
        const blob = new Blob(audioChunksRef.current, { type: recorder.mimeType || 'audio/webm' })
        const audioUrl = URL.createObjectURL(blob)
        setVoice({ recording: false, transcribing: true, audioUrl, error: '' })
        try {
          const bytes = new Uint8Array(await blob.arrayBuffer())
          let binary = ''
          const chunkSize = 0x8000
          for (let index = 0; index < bytes.length; index += chunkSize) binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
          const response = await fetch('/api/stt/transcribe', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ audioBase64: btoa(binary), mimeType: blob.type }) })
          const payload = await response.json()
          if (!response.ok) throw new Error(payload.error || '语音转写失败。')
          setPractice((current) => current ? { ...current, answer: current.answer ? `${current.answer}\n${payload.text}` : payload.text } : current)
          setVoice({ recording: false, transcribing: false, audioUrl, error: '' })
        } catch (error) {
          setVoice({ recording: false, transcribing: false, audioUrl, error: error instanceof Error ? error.message : '语音转写失败，请改用文字回答。' })
        }
      }
      mediaRecorderRef.current = recorder
      recorder.start()
      setVoice({ recording: true, transcribing: false, audioUrl: '', error: '' })
    } catch (error) {
      setVoice({ recording: false, transcribing: false, audioUrl: '', error: error instanceof Error && error.name === 'NotAllowedError' ? '麦克风权限未开启，请允许后重试。' : '无法访问麦克风，请改用文字回答。' })
    }
  }

  const stopRecording = () => {
    if (mediaRecorderRef.current?.state === 'recording') mediaRecorderRef.current.stop()
  }

  const resetVoice = () => {
    if (voice.audioUrl) URL.revokeObjectURL(voice.audioUrl)
    setVoice({ recording: false, transcribing: false, audioUrl: '', error: '' })
  }

  const submitPractice = async () => {
    if (!practice || !practice.answer.trim()) return
    const current = questions.find((question) => question.id === practice.questionIds[practice.index])
    if (!current) return
    setPractice({ ...practice, scoring: true })
    try {
      const response = await fetch('/api/score-answer', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ question: current, answer: practice.answer }) })
      const payload = await response.json()
      const score = payload.score as ScoreResult
      await fetch('/api/practice-answers', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ sessionId: practice.sessionId, questionId: current.id, answerText: practice.answer, score }) }).catch(() => {})
      setPractice({ ...practice, submitted: true, scoring: false, score })
    } catch {
      setPractice({ ...practice, submitted: true, scoring: false, score: { score: 0, strengths: [], gaps: ['评分服务暂时不可用，请稍后重试。'], betterAnswer: '' } })
    }
  }

  const renderPractice = () => {
    if (!practice) {
      const categoryOptions = ['全部分类', ...new Set(questions.map((question) => question.category))]
      return <div className="practice-setup"><p className="eyebrow">Interview workspace / 03</p><h1>刷题</h1><p className="page-description">选择范围，开始一次有记录的文字练习。</p><div className="practice-filters"><label><span>分类</span><select id="practice-category" defaultValue="全部分类">{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label><label><span>难度</span><select id="practice-difficulty" defaultValue="全部难度"><option>全部难度</option><option>简单</option><option>中等</option><option>困难</option></select></label><label><span>掌握度</span><select id="practice-mastery" defaultValue="全部掌握度"><option>全部掌握度</option><option>未学习</option><option>了解</option><option>熟悉</option><option>掌握</option></select></label></div><button className="primary-button" type="button" onClick={() => { const get = (id: string) => (document.getElementById(id) as HTMLSelectElement).value; void startPractice({ category: get('practice-category'), difficulty: get('practice-difficulty'), mastery: get('practice-mastery') }) }}>开始刷题 <ArrowRight size={13} /></button></div>
    }
    const current = questions.find((question) => question.id === practice.questionIds[practice.index])
    if (!current) return null
    return <div className="practice-page"><header className="page-header practice-header"><div><p className="eyebrow">Practice session</p><h1>刷题</h1><p className="page-description">第 {practice.index + 1} / {practice.questionIds.length} 题 · {current.category}</p></div><button className="quiet-button" type="button" onClick={() => { resetVoice(); setPractice(null) }}>退出练习</button></header><div className="practice-card"><div className="detail-topline"><span className="tag">{current.category}</span><span className={`difficulty ${current.difficulty}`}>{current.difficulty}</span><span className="importance">重要性 {current.importance}/5</span></div><h2>{current.title}</h2>{practice.submitted && practice.score ? <div className="score-panel"><div className="score-number"><strong>{practice.score.score}</strong><span>/ 100</span><small>{practice.score.source === 'llm' ? 'AI 评分' : '基础评分'}</small></div><div className="score-feedback"><div><h3>做得不错</h3><ul>{practice.score.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>可以补足</h3><ul>{practice.score.gaps.map((item) => <li key={item}>{item}</li>)}</ul></div></div>{practice.score.betterAnswer && <div className="better-answer"><h3>建议回答</h3><p>{practice.score.betterAnswer}</p></div>}</div> : <><div className="voice-answer"><div className="voice-controls"><button className={voice.recording ? 'record-button recording' : 'record-button'} type="button" onClick={voice.recording ? stopRecording : () => void startRecording()}>{voice.recording ? <><span className="record-dot" />停止录音</> : <><Mic2 size={15} />开始录音</>}</button>{voice.audioUrl && <><audio controls src={voice.audioUrl} /><button className="quiet-button" type="button" onClick={resetVoice}>重新录音</button></>}{voice.transcribing && <span className="voice-status">正在转写…</span>}</div>{voice.error && <p className="voice-error">{voice.error}</p>}<p className="voice-hint">支持语音回答；转写失败时仍可直接输入文字。</p></div><textarea className="practice-answer" value={practice.answer} onChange={(event) => setPractice({ ...practice, answer: event.target.value })} placeholder="用自己的话回答，支持 Markdown 或纯文本…" /><div className="practice-submit"><span>{practice.answer.length} 字</span><button className="primary-button" type="button" disabled={practice.scoring || voice.recording || voice.transcribing || !practice.answer.trim()} onClick={() => void submitPractice()}>{practice.scoring ? '评分中…' : '提交回答'} <Sparkles size={13} /></button></div></>}{practice.submitted && <div className="practice-next"><button className="quiet-button" type="button" onClick={() => { resetVoice(); setPractice(null) }}>结束</button><button className="primary-button" type="button" onClick={() => { resetVoice(); setPractice({ ...practice, index: practice.index + 1, answer: '', submitted: false, scoring: false, score: null }) }}>{practice.index < practice.questionIds.length - 1 ? '下一题' : '完成练习'} <ArrowRight size={13} /></button></div>}</div></div>
  }

  const renderLibrary = () => (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Interview workspace / 01</p>
          <h1>题库</h1>
          <p className="page-description">把准备过的内容沉淀成可以反复练习的题目。</p>
        </div>
        <button className="primary-button" type="button" onClick={() => openEditor()}>
          <Plus size={14} aria-hidden="true" /> 新建题目
        </button>
      </header>
      <div className="stats-row">
        <div><span>题目总数</span><strong>{questions.length}</strong></div>
        <div><span>本周已练</span><strong>12</strong></div>
        <div><span>待复习</span><strong>{questions.filter((question) => question.mastery !== '掌握').length}</strong></div>
        <div><span>掌握度</span><strong>34%</strong></div>
      </div>
      <div className="toolbar">
        <label className="search-box"><Search size={14} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索问题或关键词" /></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={mastery} onChange={(event) => setMastery(event.target.value)}>{['全部掌握度', '未学习', '了解', '熟悉', '掌握'].map((item) => <option key={item}>{item}</option>)}</select>
        <button className="quiet-button" type="button" onClick={() => setImporter({ step: 'input', source: '', drafts: [], error: '', processing: false })}><Upload size={13} />批量导入</button>
      </div>
      <div className="library-layout">
        <section className="question-list" aria-label="面试题列表">
          <div className="list-heading"><span>{filteredQuestions.length} 道题目</span><button className="icon-button" type="button" title="筛选题目"><ListFilter size={14} /></button></div>
          {filteredQuestions.map((question) => <button key={question.id} className={`question-item ${question.id === selectedId ? 'active' : ''}`} type="button" onClick={() => { setSelectedId(question.id); setShowAnswer(false) }}>
            <span className="question-item-title">{question.title}</span>
            <span className="question-item-meta"><span>{question.category}</span><span className={`difficulty ${question.difficulty}`}>{question.difficulty}</span><span className="mastery-dot" data-level={question.mastery} />{question.mastery}</span>
          </button>)}
        </section>
        <section className="question-detail">
          {selected ? <>
            <div className="detail-topline"><span className="tag">{selected.category}</span><span className={`difficulty ${selected.difficulty}`}>{selected.difficulty}</span><span className="importance">重要性 {selected.importance}/5</span><button className="icon-button" type="button" title="更多操作"><MoreHorizontal size={16} /></button></div>
            <h2>{selected.title}</h2>
            <div className="detail-section"><p className="section-label">掌握程度</p><div className="mastery-control">{(['未学习', '了解', '熟悉', '掌握'] as Mastery[]).map((item) => <button key={item} className={selected.mastery === item ? 'selected' : ''} type="button" onClick={() => updateMastery(item)}>{item}</button>)}</div></div>
            <div className="detail-section answer-section"><div className="section-heading"><p className="section-label">答案与解析</p><button className="text-button" type="button" onClick={() => setShowAnswer((value) => !value)}>{showAnswer ? '隐藏答案' : '展示答案'} {showAnswer ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button></div>{showAnswer ? <div className="answer-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.answer}</ReactMarkdown><h3>详细解析</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.explanation}</ReactMarkdown><h3>面试时建议的回答</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.interviewAnswer}</ReactMarkdown></div> : <div className="answer-locked"><Sparkles size={18} aria-hidden="true" /><p>先尝试自己回答，再查看答案和解析</p><button className="secondary-button" type="button" onClick={() => setShowAnswer(true)}>查看答案</button></div>}</div>
            <div className="detail-section"><div className="section-heading"><p className="section-label">发散问题</p><span className="optional">可选</span></div><ul className="follow-ups">{selected.followUps.map((followUp) => <li key={followUp}>{followUp}<ArrowRight size={13} aria-hidden="true" /></li>)}</ul></div>
            <div className="detail-actions"><button className="danger-button" type="button" onClick={deleteQuestion}><Trash2 size={13} />删除</button><button className="quiet-button" type="button" onClick={() => openEditor(selected)}><FilePenLine size={13} />编辑题目</button><button className="primary-button" type="button" onClick={() => setActiveNav('practice')}>开始练习 <ArrowRight size={13} /></button></div>
          </> : <div className="empty-state">从左侧选择一道题目开始</div>}
        </section>
      </div>
    </>
  )

  const renderLearning = () => {
    const current = learningQuestions[learningIndex]
    if (!current) return <div className="placeholder-page"><p className="eyebrow">Learning session</p><h1>今天没有待学习题目</h1><p>题库里的题目都已经标记为掌握，可以回到题库继续补充内容。</p><button className="primary-button" type="button" onClick={() => setActiveNav('library')}>回到题库 <ArrowRight size={13} /></button></div>
    return <div className="learning-page">
      <header className="page-header learning-header"><div><p className="eyebrow">Interview workspace / 02</p><h1>学习</h1><p className="page-description">按掌握程度从薄弱处开始，答完再看解析。</p></div><div className="learning-progress"><strong>{learningIndex + 1}</strong><span>/ {learningQuestions.length} 道</span></div></header>
      <div className="learning-card"><div className="detail-topline"><span className="tag">{current.category}</span><span className={`difficulty ${current.difficulty}`}>{current.difficulty}</span><span className="importance">重要性 {current.importance}/5</span></div><h2>{current.title}</h2><div className="thinking-box"><Sparkles size={18} /><p>先用自己的话回答，建议控制在 1-2 分钟。</p></div><div className="learning-answer">{learningReveal ? <div className="answer-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{current.answer}</ReactMarkdown><h3>详细解析</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{current.explanation}</ReactMarkdown><h3>面试时建议的回答</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{current.interviewAnswer}</ReactMarkdown></div> : <button className="reveal-button" type="button" onClick={() => setLearningReveal(true)}>查看答案与解析 <ChevronDown size={14} /></button>}</div><div className="learning-actions"><button className="quiet-button" type="button" disabled={learningIndex === 0} onClick={() => { setLearningIndex((index) => index - 1); setLearningReveal(false) }}><ArrowLeft size={13} />上一题</button><div>{masteryOrder.map((item) => <button key={item} className={`mastery-chip ${current.mastery === item ? 'selected' : ''}`} type="button" onClick={() => markLearning(item)}>{item}</button>)}</div><button className="primary-button" type="button" onClick={() => { if (learningIndex < learningQuestions.length - 1) { setLearningIndex((index) => index + 1); setLearningReveal(false) } else setActiveNav('library') }}>下一题 <ArrowRight size={13} /></button></div></div>
    </div>
  }

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">IP</span><span>InterviewPrep</span></div>
      <div className="profile"><div className="avatar">穆</div><div><strong>穆兰</strong><span>准备中 · 前端 / AI</span></div><button className="icon-button" type="button" title="切换资料"><ChevronDown size={14} /></button></div>
      <nav>{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} className={activeNav === item.id ? 'active' : ''} type="button" onClick={() => setActiveNav(item.id)}><Icon className="nav-icon" size={17} aria-hidden="true" />{item.label}{item.id === 'learning' && <span className="nav-badge">3</span>}</button> })}</nav>
      <div className="sidebar-bottom"><button type="button"><Settings size={15} />设置</button><div className="sync-status"><span />{serverReady ? 'SQLite 已连接' : '本地数据模式'}</div><div className="sync-status"><span />{llmStatus ? `LLM endpoint 已配置 · ${llmConfig.model}` : 'LLM 待配置'}</div></div>
    </aside>
    <main className="main-content">
      {activeNav === 'library' ? renderLibrary() : activeNav === 'learning' ? renderLearning() : activeNav === 'practice' ? renderPractice() : <div className="placeholder-page"><p className="eyebrow">Interview workspace</p><h1>{navItems.find((item) => item.id === activeNav)?.label}</h1><p>这一板块正在接入题库数据。先从题库选择内容，准备你的下一轮练习。</p><button className="primary-button" type="button" onClick={() => setActiveNav('library')}>回到题库 <ArrowRight size={13} /></button></div>}
    </main>
    {editor && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setEditor(null) }}>
      <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
        <div className="modal-header"><div><p className="eyebrow">Question editor</p><h2 id="editor-title">{editor.mode === 'create' ? '新建题目' : '编辑题目'}</h2></div><button className="icon-button" type="button" title="关闭" onClick={() => setEditor(null)}><X size={18} /></button></div>
        <div className="editor-grid">
          <label className="full-field"><span>问题</span><textarea rows={3} value={editor.draft.title} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, title: event.target.value } })} placeholder="输入面试问题" /></label>
          <label><span>分类</span><input value={editor.draft.category} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, category: event.target.value } })} placeholder="例如 React" /></label>
          <label><span>难度</span><select value={editor.draft.difficulty} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, difficulty: event.target.value as Difficulty } })}><option>简单</option><option>中等</option><option>困难</option></select></label>
          <label><span>重要性</span><input type="number" min="1" max="5" value={editor.draft.importance} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, importance: Number(event.target.value) } })} /></label>
          <label className="full-field"><span>答案（Markdown）</span><textarea rows={5} value={editor.draft.answer} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, answer: event.target.value } })} /></label>
          <label className="full-field"><span>详细解析（Markdown）</span><textarea rows={5} value={editor.draft.explanation} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, explanation: event.target.value } })} /></label>
          <label className="full-field"><span>面试时建议的回答</span><textarea rows={4} value={editor.draft.interviewAnswer} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, interviewAnswer: event.target.value } })} /></label>
          <label className="full-field"><span>发散问题（每行一个）</span><textarea rows={3} value={editor.draft.followUps.join('\n')} onChange={(event) => setEditor({ ...editor, draft: { ...editor.draft, followUps: event.target.value.split('\n').filter(Boolean) } })} /></label>
        </div>
        <div className="modal-actions"><button className="quiet-button" type="button" onClick={() => setEditor(null)}>取消</button><button className="primary-button" type="button" disabled={!editor.draft.title.trim() || !editor.draft.category.trim()} onClick={saveQuestion}>保存题目</button></div>
      </section>
    </div>}
    {importer && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImporter(null) }}><section className="editor-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-header"><div><p className="eyebrow">Question import</p><h2 id="import-title">{importer.step === 'input' ? '批量导入题目' : '确认导入内容'}</h2></div><button className="icon-button" type="button" title="关闭" onClick={() => setImporter(null)}><X size={18} /></button></div>{importer.step === 'input' ? <><div className="import-hint"><FileUp size={20} /><div><strong>粘贴 JSON 或 Markdown</strong><p>支持题目数组 JSON，或用二级标题分隔的 Markdown 题目块。解析后会先预览，不会直接修改题库。</p></div></div><textarea className="import-textarea" value={importer.source} onChange={(event) => setImporter({ ...importer, source: event.target.value, error: '' })} placeholder={'示例：\n[{"title":"什么是闭包？","category":"JavaScript","difficulty":"中等","answer":"..."}]'} />{importer.error && <p className="form-error">{importer.error}</p>}<div className="modal-actions"><button className="quiet-button" type="button" onClick={() => setImporter(null)}>取消</button><button className="quiet-button" type="button" disabled={importer.processing || !importer.source.trim()} onClick={importPreview}>本地解析</button><button className="primary-button" type="button" disabled={importer.processing || !importer.source.trim()} onClick={importWithAi}>{importer.processing ? 'AI 解析中…' : 'AI 解析'} <Sparkles size={13} /></button></div></> : <><div className="import-summary"><Check size={16} /> 已解析 {importer.drafts.length} 道题目，确认后加入题库</div><div className="import-preview-list">{importer.drafts.map((draft, index) => <div key={`${draft.title}-${index}`}><strong>{draft.title}</strong><span>{draft.category} · {draft.difficulty} · 重要性 {draft.importance}/5</span></div>)}</div><div className="modal-actions"><button className="quiet-button" type="button" onClick={() => setImporter({ ...importer, step: 'input' })}><ArrowLeft size={13} />返回修改</button><button className="primary-button" type="button" onClick={confirmImport}>确认导入 <Check size={13} /></button></div></>}</section></div>}
  </div>
}

export default App
