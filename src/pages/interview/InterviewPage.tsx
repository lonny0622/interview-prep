import { ArrowRight, Mic2 } from 'lucide-react'
import { InterviewSetup } from '../../components/interview/InterviewSetup'
import type { AudioRecorderState } from '../../hooks/useAudioRecorder'
import type { InterviewSetup as InterviewSetupState, InterviewViewState } from '../../types/interview'
import type { JobProfile } from '../../types/profile'

type Props = {
  jobs: JobProfile[]
  setup: InterviewSetupState
  interview: InterviewViewState | null
  voice: AudioRecorderState
  onSetupChange: React.Dispatch<React.SetStateAction<InterviewSetupState>>
  onStart: () => void
  onOpenProfile: () => void
  onAnswerChange: (answer: string) => void
  onToggleRecording: () => void
  onSubmitTurn: () => void
  onComplete: () => void
  onExit: () => void
}

export function InterviewPage({ jobs, setup, interview, voice, onSetupChange, onStart, onOpenProfile, onAnswerChange, onToggleRecording, onSubmitTurn, onComplete, onExit }: Props) {
  if (!interview) {
    return <InterviewSetup jobs={jobs} setup={setup} setSetup={onSetupChange} onStart={onStart} onOpenProfile={onOpenProfile} />
  }

  if (interview.loading && !interview.session.id) {
    return <div className="interview-setup"><p className="eyebrow">Interview session</p><h1>正在准备面试</h1><p className="page-description">正在根据岗位、JD 和简历生成问题蓝图…</p></div>
  }

  if (interview.report) {
    return <div className="interview-page">
      <header className="page-header interview-header"><div><p className="eyebrow">Interview review</p><h1>模拟面试复盘</h1><p className="page-description">共完成 {interview.turns.length} 轮回答 · {setup.role || '目标岗位'}</p></div><button className="quiet-button" type="button" onClick={onExit}>新建一场</button></header>
      <div className="review-grid"><section className="review-summary"><span className="review-score-label">本次总结</span><p>{interview.report.summary}</p></section><section><h3>做得好的地方</h3><ul>{interview.report.strengths.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>需要注意</h3><ul>{interview.report.risks.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>下一步训练</h3><ul>{interview.report.suggestions.map((item) => <li key={item}>{item}</li>)}</ul></section><section><h3>推荐重练题</h3><ul>{interview.report.nextQuestions.map((item) => <li key={item}>{item}</li>)}</ul></section></div>
    </div>
  }

  const current = interview.session.blueprint[interview.session.currentIndex]
  if (!current) return null

  return <div className="interview-page">
    <header className="page-header interview-header"><div><p className="eyebrow">Live interview · {setup.duration}</p><h1>模拟面试</h1><p className="page-description">第 {interview.session.currentIndex + 1} / {interview.session.blueprint.length} 轮 · {current.kind}</p></div><button className="quiet-button" type="button" onClick={onExit}>退出面试</button></header>
    <div className="interview-card">
      <div className="stage-track">{interview.session.blueprint.map((item, index) => <span key={`${item.stage}-${index}`} className={index < interview.session.currentIndex ? 'done' : index === interview.session.currentIndex ? 'current' : ''}>{item.kind}</span>)}</div>
      <span className="tag">{current.kind}</span><h2>{current.question}</h2><p className="interview-focus">考察重点：{current.focus}</p>
      <div className="voice-answer"><div className="voice-controls"><button className={voice.recording ? 'record-button recording' : 'record-button'} type="button" onClick={onToggleRecording}>{voice.recording ? <><span className="record-dot" />停止录音</> : <><Mic2 size={15} />语音回答</>}</button>{voice.audioUrl && <audio controls src={voice.audioUrl} />}{voice.transcribing && <span className="voice-status">正在转写…</span>}</div>{voice.error && <p className="voice-error">{voice.error}</p>}<p className="voice-hint">可以语音回答，也可以直接输入文字；两种回答会进入同一份面试记录。</p></div>
      <textarea className="practice-answer" value={interview.answer} onChange={(event) => onAnswerChange(event.target.value)} placeholder="像真实面试一样回答，建议先说结论，再讲过程和结果…" />
      <div className="practice-submit"><span>{interview.answer.length} 字</span><button className="primary-button" type="button" disabled={interview.loading || voice.recording || voice.transcribing || !interview.answer.trim()} onClick={onSubmitTurn}>{interview.loading ? '记录中…' : interview.session.currentIndex === interview.session.blueprint.length - 1 ? '记录并进入复盘' : '提交回答'} <ArrowRight size={13} /></button></div>
      {interview.error && <p className="voice-error">{interview.error}</p>}
      {interview.session.currentIndex > 0 && <div className="turn-history"><h3>已完成回答</h3>{interview.turns.slice(-3).map((turn, index) => <div key={`${turn.question}-${index}`}><span>{turn.stage}</span><p>{turn.answerText}</p></div>)}</div>}
      <div className="interview-footer"><button className="quiet-button" type="button" onClick={onComplete} disabled={interview.completing}>{interview.completing ? '生成复盘中…' : '提前结束并复盘'}</button></div>
    </div>
  </div>
}
