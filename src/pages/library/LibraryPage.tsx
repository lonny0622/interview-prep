import { ArrowRight, ChevronDown, ChevronUp, FilePenLine, ListFilter, MoreHorizontal, Plus, Search, Settings, Sparkles, Trash2, Upload } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { Mastery, Question } from '../../types/question'

type Props = {
  questions: Question[]
  filteredQuestions: Question[]
  selected: Question | undefined
  selectedId: string
  categories: string[]
  query: string
  category: string
  difficulty: string
  mastery: string
  showAnswer: boolean
  onQueryChange: (value: string) => void
  onCategoryChange: (value: string) => void
  onDifficultyChange: (value: string) => void
  onMasteryFilterChange: (value: string) => void
  onSelectQuestion: (id: string) => void
  onShowAnswerChange: (show: boolean) => void
  onUpdateMastery: (mastery: Mastery) => void
  onCreateQuestion: () => void
  onEditQuestion: (question: Question) => void
  onDeleteQuestion: () => void
  onManageCategories: () => void
  onImportQuestions: () => void
  onStartPractice: () => void
}

export function LibraryPage(props: Props) {
  const {
    questions, filteredQuestions, selected, selectedId, categories, query, category, difficulty, mastery,
    showAnswer, onQueryChange, onCategoryChange, onDifficultyChange, onMasteryFilterChange,
    onSelectQuestion, onShowAnswerChange, onUpdateMastery, onCreateQuestion, onEditQuestion,
    onDeleteQuestion, onManageCategories, onImportQuestions, onStartPractice,
  } = props

  return <div className="library-page">
    <header className="page-header">
      <div><p className="eyebrow">Interview workspace / 01</p><h1>题库</h1><p className="page-description">把准备过的内容沉淀成可以反复练习的题目。</p></div>
      <button className="primary-button" type="button" onClick={onCreateQuestion}><Plus size={14} aria-hidden="true" /> 新建题目</button>
    </header>
    <div className="stats-row">
      <div><span>题目总数</span><strong>{questions.length}</strong></div>
      <div><span>本周已练</span><strong>12</strong></div>
      <div><span>待复习</span><strong>{questions.filter((question) => question.mastery !== '掌握').length}</strong></div>
      <div><span>掌握度</span><strong>34%</strong></div>
    </div>
    <div className="toolbar">
      <label className="search-box"><Search size={14} aria-hidden="true" /><input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="搜索问题或关键词" /></label>
      <select value={category} onChange={(event) => onCategoryChange(event.target.value)}>{categories.map((item) => <option key={item}>{item}</option>)}</select>
      <select value={difficulty} onChange={(event) => onDifficultyChange(event.target.value)}>{['全部难度', '简单', '中等', '困难'].map((item) => <option key={item}>{item}</option>)}</select>
      <select value={mastery} onChange={(event) => onMasteryFilterChange(event.target.value)}>{['全部掌握度', '未学习', '了解', '熟悉', '掌握'].map((item) => <option key={item}>{item}</option>)}</select>
      <button className="quiet-button" type="button" onClick={onManageCategories}><Settings size={13} />管理分类</button>
      <button className="quiet-button" type="button" onClick={onImportQuestions}><Upload size={13} />批量导入</button>
    </div>
    <div className="library-layout">
      <section className="question-list" aria-label="面试题列表">
        <div className="list-heading"><span>{filteredQuestions.length} 道题目</span><button className="icon-button" type="button" title="筛选题目"><ListFilter size={14} /></button></div>
        {filteredQuestions.map((question) => <button key={question.id} className={`question-item ${question.id === selectedId ? 'active' : ''}`} type="button" onClick={() => onSelectQuestion(question.id)}>
          <span className="question-item-title">{question.title}</span>
          <span className="question-item-meta"><span>{question.category}</span><span className={`difficulty ${question.difficulty}`}>{question.difficulty}</span><span className="mastery-dot" data-level={question.mastery} />{question.mastery}</span>
        </button>)}
      </section>
      <section className="question-detail">
        {selected ? <>
          <div className="detail-topline"><span className="tag">{selected.category}</span><span className={`difficulty ${selected.difficulty}`}>{selected.difficulty}</span><span className="importance">重要性 {selected.importance}/5</span><button className="icon-button" type="button" title="更多操作"><MoreHorizontal size={16} /></button></div>
          <h2>{selected.title}</h2>
          <div className="detail-section"><p className="section-label">掌握程度</p><div className="mastery-control">{(['未学习', '了解', '熟悉', '掌握'] as Mastery[]).map((item) => <button key={item} className={selected.mastery === item ? 'selected' : ''} type="button" onClick={() => onUpdateMastery(item)}>{item}</button>)}</div></div>
          <div className="detail-section answer-section">
            <div className="section-heading"><p className="section-label">答案与解析</p><button className="text-button" type="button" onClick={() => onShowAnswerChange(!showAnswer)}>{showAnswer ? '隐藏答案' : '展示答案'} {showAnswer ? <ChevronUp size={13} /> : <ChevronDown size={13} />}</button></div>
            {showAnswer ? <div className="answer-content"><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.answer}</ReactMarkdown><h3>详细解析</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.explanation}</ReactMarkdown><h3>面试时建议的回答</h3><ReactMarkdown remarkPlugins={[remarkGfm]}>{selected.interviewAnswer}</ReactMarkdown></div> : <div className="answer-locked"><Sparkles size={18} aria-hidden="true" /><p>先尝试自己回答，再查看答案和解析</p><button className="secondary-button" type="button" onClick={() => onShowAnswerChange(true)}>查看答案</button></div>}
          </div>
          <div className="detail-section"><div className="section-heading"><p className="section-label">发散问题</p><span className="optional">可选</span></div><ul className="follow-ups">{selected.followUps.map((followUp) => <li key={followUp}>{followUp}<ArrowRight size={13} aria-hidden="true" /></li>)}</ul></div>
          <div className="detail-actions"><button className="danger-button" type="button" onClick={onDeleteQuestion}><Trash2 size={13} />删除</button><button className="quiet-button" type="button" onClick={() => onEditQuestion(selected)}><FilePenLine size={13} />编辑题目</button><button className="primary-button" type="button" onClick={onStartPractice}>开始练习 <ArrowRight size={13} /></button></div>
        </> : <div className="empty-state">从左侧选择一道题目开始</div>}
      </section>
    </div>
  </div>
}
