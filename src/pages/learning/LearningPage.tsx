import { ArrowLeft, ArrowRight, ChevronDown, Sparkles } from 'lucide-react'
import { MarkdownContent } from '../../components/markdown/MarkdownContent'
import { FollowUpList } from '../../components/questions/FollowUpList'
import { DIFFICULTY_ORDER, EMPTY_LEARNING_FILTERS, MASTERY_ORDER } from '../../constants/questions'
import { useTextSelectionAction } from '../../features/ai/useTextSelectionAction'
import type { Mastery, Question } from '../../types/question'
import type { LearningFilters, LearningStats } from '../../types/study'

type Props = {
  questions: Question[]
  index: number
  revealAnswer: boolean
  stats: LearningStats
  filters: LearningFilters
  categories: string[]
  onFiltersChange: (patch: Partial<LearningFilters>) => void
  onRevealAnswer: () => void
  onPrevious: () => void
  onNext: () => void
  onMarkMastery: (mastery: Mastery) => void
  onQuestionContextMenu: (event: React.MouseEvent<HTMLElement>, question: Question) => void
  onExplainSelection: (text: string, question: Question) => void
  onEditFollowUpAnswer: (question: Question, index: number) => void
  onGenerateFollowUpAnswer: (question: Question, index: number) => void
}

export function LearningPage({ questions, index, revealAnswer, stats, filters, categories, onFiltersChange, onRevealAnswer, onPrevious, onNext, onMarkMastery, onQuestionContextMenu, onExplainSelection, onEditFollowUpAnswer, onGenerateFollowUpAnswer }: Props) {
  const current = questions[index]
  const masteryTotal = Math.max(stats.totalQuestions, 1)
  const { containerRef, selectionAction } = useTextSelectionAction<HTMLDivElement>(current, onExplainSelection)

  return <div className="learning-page">
    <header className="page-header learning-header">
      <div><p className="eyebrow">Interview workspace / 02</p><h1>学习</h1><p className="page-description">按分类、难度和掌握程度选择内容，答完再看解析。</p></div>
      <div className="learning-progress"><strong>{current ? index + 1 : 0}</strong><span>/ {questions.length} 道</span></div>
    </header>
    <section className="learning-statistics" aria-label="学习统计">
      <div className="learning-stat-cards">
        <div><span>今日学习</span><strong>{stats.todayLearned}</strong><small>道题（按题目去重）</small></div>
        <div><span>题库总数</span><strong>{stats.totalQuestions}</strong><small>道题目</small></div>
        <div><span>已掌握</span><strong>{stats.mastery.掌握}</strong><small>{Math.round((stats.mastery.掌握 / masteryTotal) * 100)}% 的题目</small></div>
        <div><span>当前筛选</span><strong>{questions.length}</strong><small>道待学习</small></div>
      </div>
      <div className="learning-stat-detail">
        <section>
          <div className="learning-section-heading"><div><p className="section-label">全部掌握程度</p><span>题库当前状态分布</span></div></div>
          <div className="mastery-distribution">{MASTERY_ORDER.map((item) => <div key={item} className="mastery-distribution-row"><span>{item}</span><div className="mastery-bar"><i data-level={item} style={{ width: `${Math.round((stats.mastery[item] / masteryTotal) * 100)}%` }} /></div><strong>{stats.mastery[item]}</strong></div>)}</div>
        </section>
        <section>
          <div className="learning-section-heading"><div><p className="section-label">分类掌握程度</p><span>按分类查看已掌握与待复习</span></div></div>
          <div className="category-mastery-list">{stats.categories.length ? stats.categories.map((item) => <div key={item.name} className="category-mastery-row"><div><strong>{item.name}</strong><span>{item.mastery.掌握} / {item.total} 已掌握</span></div><div className="mastery-bar"><i data-level="掌握" style={{ width: `${Math.round((item.mastery.掌握 / Math.max(item.total, 1)) * 100)}%` }} /></div></div>) : <p className="learning-empty-note">还没有题目分类。</p>}</div>
        </section>
      </div>
    </section>
    <section className="learning-filter-panel">
      <div><p className="section-label">学习设置</p><span>选择后会从符合条件的题目重新开始</span></div>
      <div className="learning-filter-controls">
        <label><span>分类</span><select value={filters.category} onChange={(event) => onFiltersChange({ category: event.target.value })}>{categories.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>难度</span><select value={filters.difficulty} onChange={(event) => onFiltersChange({ difficulty: event.target.value })}>{['全部难度', ...DIFFICULTY_ORDER].map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>掌握程度</span><select value={filters.mastery} onChange={(event) => onFiltersChange({ mastery: event.target.value })}>{['未学习', '全部掌握度', '了解', '熟悉', '掌握'].map((item) => <option key={item}>{item}</option>)}</select></label>
        <button className="quiet-button" type="button" onClick={() => onFiltersChange(EMPTY_LEARNING_FILTERS)}>重置筛选</button>
      </div>
    </section>
    {current ? <div ref={containerRef} className="learning-card" onContextMenu={(event) => onQuestionContextMenu(event, current)}>
      <div className="detail-topline"><span className="tag">{current.category}</span><span className={`difficulty ${current.difficulty}`}>{current.difficulty}</span><span className="importance">重要性 {current.importance}/5</span></div>
      <h2>{current.title}</h2>
      <div className="thinking-box"><Sparkles size={18} /><p>先用自己的话回答，建议控制在 1-2 分钟。</p></div>
      <div className="learning-answer">{revealAnswer ? <div className="answer-content"><MarkdownContent>{current.answer}</MarkdownContent><h3>详细解析</h3><MarkdownContent>{current.explanation}</MarkdownContent><h3>面试时建议的回答</h3><MarkdownContent>{current.interviewAnswer}</MarkdownContent><div className="learning-follow-ups"><div className="section-heading"><p className="section-label">发散问题</p><span className="optional">点击展开</span></div><FollowUpList question={current} onEditAnswer={onEditFollowUpAnswer} onGenerateAnswer={onGenerateFollowUpAnswer} /></div></div> : <button className="reveal-button" type="button" onClick={onRevealAnswer}>查看答案与解析 <ChevronDown size={14} /></button>}</div>
      <div className="learning-actions"><button className="quiet-button" type="button" disabled={index === 0} onClick={onPrevious}><ArrowLeft size={13} />上一题</button><div>{MASTERY_ORDER.map((item) => <button key={item} className={`mastery-chip ${current.mastery === item ? 'selected' : ''}`} type="button" onClick={() => onMarkMastery(item)}>{item}</button>)}</div><button className="primary-button" type="button" onClick={onNext}>下一题 <ArrowRight size={13} /></button></div>
    </div> : <div className="learning-empty-state"><Sparkles size={20} /><div><strong>当前筛选没有题目</strong><p>可以切换分类、难度或掌握程度，继续安排学习。</p></div><button className="primary-button" type="button" onClick={() => onFiltersChange(EMPTY_LEARNING_FILTERS)}>查看未学习题目 <ArrowRight size={13} /></button></div>}
    {selectionAction}
  </div>
}
