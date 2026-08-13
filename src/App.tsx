import { useMemo, useState } from 'react'
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
  { id: 'library', label: '题库', icon: '▤' },
  { id: 'learning', label: '学习', icon: '◒' },
  { id: 'practice', label: '刷题', icon: '◇' },
  { id: 'interview', label: '模拟面试', icon: '◉' },
]

function App() {
  const [questions, setQuestions] = useState(seedQuestions)
  const [activeNav, setActiveNav] = useState('library')
  const [query, setQuery] = useState('')
  const [category, setCategory] = useState('全部分类')
  const [mastery, setMastery] = useState('全部掌握度')
  const [selectedId, setSelectedId] = useState(seedQuestions[0].id)
  const [showAnswer, setShowAnswer] = useState(false)

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
  }

  const renderLibrary = () => (
    <>
      <header className="page-header">
        <div>
          <p className="eyebrow">Interview workspace / 01</p>
          <h1>题库</h1>
          <p className="page-description">把准备过的内容沉淀成可以反复练习的题目。</p>
        </div>
        <button className="primary-button" type="button" onClick={() => setSelectedId('new')}>
          <span aria-hidden="true">＋</span> 新建题目
        </button>
      </header>
      <div className="stats-row">
        <div><span>题目总数</span><strong>{questions.length}</strong></div>
        <div><span>本周已练</span><strong>12</strong></div>
        <div><span>待复习</span><strong>{questions.filter((question) => question.mastery !== '掌握').length}</strong></div>
        <div><span>掌握度</span><strong>34%</strong></div>
      </div>
      <div className="toolbar">
        <label className="search-box"><span aria-hidden="true">⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索问题或关键词" /></label>
        <select value={category} onChange={(event) => setCategory(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
        <select value={mastery} onChange={(event) => setMastery(event.target.value)}>{['全部掌握度', '未学习', '了解', '熟悉', '掌握'].map((item) => <option key={item}>{item}</option>)}</select>
        <button className="quiet-button" type="button">批量导入</button>
      </div>
      <div className="library-layout">
        <section className="question-list" aria-label="面试题列表">
          <div className="list-heading"><span>{filteredQuestions.length} 道题目</span><button className="icon-button" type="button" title="排序">↕</button></div>
          {filteredQuestions.map((question) => <button key={question.id} className={`question-item ${question.id === selectedId ? 'active' : ''}`} type="button" onClick={() => { setSelectedId(question.id); setShowAnswer(false) }}>
            <span className="question-item-title">{question.title}</span>
            <span className="question-item-meta"><span>{question.category}</span><span className={`difficulty ${question.difficulty}`}>{question.difficulty}</span><span className="mastery-dot" data-level={question.mastery} />{question.mastery}</span>
          </button>)}
        </section>
        <section className="question-detail">
          {selected ? <>
            <div className="detail-topline"><span className="tag">{selected.category}</span><span className={`difficulty ${selected.difficulty}`}>{selected.difficulty}</span><span className="importance">重要性 {selected.importance}/5</span><button className="icon-button" type="button" title="更多操作">•••</button></div>
            <h2>{selected.title}</h2>
            <div className="detail-section"><p className="section-label">掌握程度</p><div className="mastery-control">{(['未学习', '了解', '熟悉', '掌握'] as Mastery[]).map((item) => <button key={item} className={selected.mastery === item ? 'selected' : ''} type="button" onClick={() => updateMastery(item)}>{item}</button>)}</div></div>
            <div className="detail-section answer-section"><div className="section-heading"><p className="section-label">答案与解析</p><button className="text-button" type="button" onClick={() => setShowAnswer((value) => !value)}>{showAnswer ? '隐藏答案' : '展示答案'} <span aria-hidden="true">{showAnswer ? '⌃' : '⌄'}</span></button></div>{showAnswer ? <div className="answer-content"><p>{selected.answer}</p><h3>详细解析</h3><p>{selected.explanation}</p><h3>面试时建议的回答</h3><p>{selected.interviewAnswer}</p></div> : <div className="answer-locked"><span aria-hidden="true">◌</span><p>先尝试自己回答，再查看答案和解析</p><button className="secondary-button" type="button" onClick={() => setShowAnswer(true)}>查看答案</button></div>}</div>
            <div className="detail-section"><div className="section-heading"><p className="section-label">发散问题</p><span className="optional">可选</span></div><ul className="follow-ups">{selected.followUps.map((followUp) => <li key={followUp}>{followUp}<span aria-hidden="true">→</span></li>)}</ul></div>
            <div className="detail-actions"><button className="quiet-button" type="button">编辑题目</button><button className="primary-button" type="button" onClick={() => setActiveNav('practice')}>开始练习 <span aria-hidden="true">→</span></button></div>
          </> : <div className="empty-state">从左侧选择一道题目开始</div>}
        </section>
      </div>
    </>
  )

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">IP</span><span>InterviewPrep</span></div>
      <div className="profile"><div className="avatar">穆</div><div><strong>穆兰</strong><span>准备中 · 前端 / AI</span></div><button className="icon-button" type="button" title="切换资料">⌄</button></div>
      <nav>{navItems.map((item) => <button key={item.id} className={activeNav === item.id ? 'active' : ''} type="button" onClick={() => setActiveNav(item.id)}><span className="nav-icon" aria-hidden="true">{item.icon}</span>{item.label}{item.id === 'learning' && <span className="nav-badge">3</span>}</button>)}</nav>
      <div className="sidebar-bottom"><button type="button"><span aria-hidden="true">⚙</span>设置</button><div className="sync-status"><span />本地数据已同步</div></div>
    </aside>
    <main className="main-content">
      {activeNav === 'library' ? renderLibrary() : <div className="placeholder-page"><p className="eyebrow">Interview workspace</p><h1>{navItems.find((item) => item.id === activeNav)?.label}</h1><p>这一板块正在接入题库数据。先从题库选择内容，准备你的下一轮练习。</p><button className="primary-button" type="button" onClick={() => setActiveNav('library')}>回到题库 <span aria-hidden="true">→</span></button></div>}
    </main>
  </div>
}

export default App
