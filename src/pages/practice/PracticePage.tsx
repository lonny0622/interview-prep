import { ArrowRight, Mic2, Sparkles } from 'lucide-react'
import { useState } from 'react'
import type { AudioRecorderState } from '../../hooks/useAudioRecorder'
import type { Question } from '../../types/question'
import type { PracticeFilters, PracticeState } from '../../types/study'

type Props = {
  questions: Question[]
  practice: PracticeState | null
  voice: AudioRecorderState
  onStart: (filters: PracticeFilters) => void
  onAnswerChange: (answer: string) => void
  onStartRecording: () => void
  onStopRecording: () => void
  onResetRecording: () => void
  onSubmit: () => void
  onExit: () => void
  onNext: () => void
}

const DEFAULT_FILTERS: PracticeFilters = {
  category: '全部分类',
  difficulty: '全部难度',
  mastery: '全部掌握度',
}

export function PracticePage({ questions, practice, voice, onStart, onAnswerChange, onStartRecording, onStopRecording, onResetRecording, onSubmit, onExit, onNext }: Props) {
  const [filters, setFilters] = useState<PracticeFilters>(DEFAULT_FILTERS)

  if (!practice) {
    const categoryOptions = ['全部分类', ...new Set(questions.map((question) => question.category))]
    return <div className="practice-setup">
      <p className="eyebrow">Interview workspace / 03</p><h1>刷题</h1><p className="page-description">选择范围，开始一次有记录的文字练习。</p>
      <div className="practice-filters">
        <label><span>分类</span><select value={filters.category} onChange={(event) => setFilters((current) => ({ ...current, category: event.target.value }))}>{categoryOptions.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label><span>难度</span><select value={filters.difficulty} onChange={(event) => setFilters((current) => ({ ...current, difficulty: event.target.value }))}><option>全部难度</option><option>简单</option><option>中等</option><option>困难</option></select></label>
        <label><span>掌握度</span><select value={filters.mastery} onChange={(event) => setFilters((current) => ({ ...current, mastery: event.target.value }))}><option>全部掌握度</option><option>未学习</option><option>了解</option><option>熟悉</option><option>掌握</option></select></label>
      </div>
      <button className="primary-button" type="button" onClick={() => onStart(filters)}>开始刷题 <ArrowRight size={13} /></button>
    </div>
  }

  const current = questions.find((question) => question.id === practice.questionIds[practice.index])
  if (!current) return null

  return <div className="practice-page">
    <header className="page-header practice-header"><div><p className="eyebrow">Practice session</p><h1>刷题</h1><p className="page-description">第 {practice.index + 1} / {practice.questionIds.length} 题 · {current.category}</p></div><button className="quiet-button" type="button" onClick={onExit}>退出练习</button></header>
    <div className="practice-card">
      <div className="detail-topline"><span className="tag">{current.category}</span><span className={`difficulty ${current.difficulty}`}>{current.difficulty}</span><span className="importance">重要性 {current.importance}/5</span></div>
      <h2>{current.title}</h2>
      {practice.submitted && practice.score ? <div className="score-panel"><div className="score-number"><strong>{practice.score.score}</strong><span>/ 100</span><small>{practice.score.source === 'llm' ? 'AI 评分' : '基础评分'}</small></div><div className="score-feedback"><div><h3>做得不错</h3><ul>{practice.score.strengths.map((item) => <li key={item}>{item}</li>)}</ul></div><div><h3>可以补足</h3><ul>{practice.score.gaps.map((item) => <li key={item}>{item}</li>)}</ul></div></div>{practice.score.betterAnswer && <div className="better-answer"><h3>建议回答</h3><p>{practice.score.betterAnswer}</p></div>}</div> : <>
        <div className="voice-answer"><div className="voice-controls"><button className={voice.recording ? 'record-button recording' : 'record-button'} type="button" onClick={voice.recording ? onStopRecording : onStartRecording}>{voice.recording ? <><span className="record-dot" />停止录音</> : <><Mic2 size={15} />开始录音</>}</button>{voice.audioUrl && <><audio controls src={voice.audioUrl} /><button className="quiet-button" type="button" onClick={onResetRecording}>重新录音</button></>}{voice.transcribing && <span className="voice-status">正在转写…</span>}</div>{voice.error && <p className="voice-error">{voice.error}</p>}<p className="voice-hint">支持语音回答；转写失败时仍可直接输入文字。</p></div>
        <textarea className="practice-answer" value={practice.answer} onChange={(event) => onAnswerChange(event.target.value)} placeholder="用自己的话回答，支持 Markdown 或纯文本…" />
        <div className="practice-submit"><span>{practice.answer.length} 字</span><button className="primary-button" type="button" disabled={practice.scoring || voice.recording || voice.transcribing || !practice.answer.trim()} onClick={onSubmit}>{practice.scoring ? '评分中…' : '提交回答'} <Sparkles size={13} /></button></div>
      </>}
      {practice.submitted && <div className="practice-next"><button className="quiet-button" type="button" onClick={onExit}>结束</button><button className="primary-button" type="button" onClick={onNext}>{practice.index < practice.questionIds.length - 1 ? '下一题' : '完成练习'} <ArrowRight size={13} /></button></div>}
    </div>
  </div>
}
