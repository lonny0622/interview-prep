import { Sparkles, X } from 'lucide-react'
import { MarkdownContent } from '../markdown/MarkdownContent'
import type { FollowUpAnswerEditorState, Question } from '../../types/question'

type Props = {
  state: FollowUpAnswerEditorState
  question: Question
  onChange: (state: FollowUpAnswerEditorState) => void
  onGenerate: () => void
  onSave: () => void
  onClose: () => void
}

export function FollowUpAnswerModal({ state, question, onChange, onGenerate, onSave, onClose }: Props) {
  const followUp = question.followUps[state.followUpIndex]
  if (!followUp) return null
  const busy = state.generating || state.saving

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !busy) onClose() }}>
    <section className="editor-modal follow-up-answer-modal" role="dialog" aria-modal="true" aria-labelledby="follow-up-answer-title">
      <div className="modal-header">
        <div><p className="eyebrow">Follow-up answer</p><h2 id="follow-up-answer-title">补充追问回答</h2></div>
        <button className="icon-button" type="button" title="关闭" disabled={busy} onClick={onClose}><X size={18} /></button>
      </div>
      <div className="follow-up-answer-form">
        <div className="follow-up-context">
          <span>{question.category} · {question.difficulty}</span>
          <strong>{question.title}</strong>
          <div className="follow-up-main-answer"><small>原题答案 · 会作为 AI 上下文</small><MarkdownContent>{question.answer}</MarkdownContent></div>
          <div className="follow-up-target"><small>本次追问</small><p>{followUp.question}</p></div>
        </div>
        <label><span>补充信息 <small>可选，会连同原题、分类和原题答案一起发送给 AI</small></span><textarea rows={3} maxLength={4000} value={state.supplementalInfo} disabled={busy} onChange={(event) => onChange({ ...state, supplementalInfo: event.target.value, error: '' })} placeholder="例如：按 React Native 0.76+ 回答；只保留最关键的两个要点。" /></label>
        <label><span>追问回答（Markdown） <small>默认 1 句结论 + 2–4 个关键点，复杂问题可适当展开</small></span><textarea rows={7} maxLength={1600} autoFocus value={state.answer} disabled={busy} onChange={(event) => onChange({ ...state, answer: event.target.value, error: '' })} placeholder="可以手动填写，也可以让 AI 生成重点清晰、容易记忆的回答。" /></label>
        {state.error && <p className="form-error follow-up-form-error">{state.error}</p>}
      </div>
      <div className="modal-actions">
        <button className="quiet-button" type="button" disabled={busy} onClick={onClose}>取消</button>
        <button className="quiet-button" type="button" disabled={busy} onClick={onGenerate}><Sparkles size={13} />{state.generating ? '正在生成…' : state.answer.trim() ? '重新生成' : 'AI 生成回答'}</button>
        <button className="primary-button" type="button" disabled={busy || !state.answer.trim()} onClick={onSave}>{state.saving ? '正在保存…' : '保存回答'}</button>
      </div>
    </section>
  </div>
}
