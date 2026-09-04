import { Check, RefreshCw, Sparkles, X } from 'lucide-react'
import type { QuestionDraft, QuestionRegeneratorState } from '../../types/question'
import { FollowUpEditorFields } from './FollowUpEditorFields'

type Props = {
  state: QuestionRegeneratorState
  onChange: (state: QuestionRegeneratorState) => void
  onClose: () => void
  onStart: () => void
  onContinue: () => void
  onConfirm: () => void
}

export function QuestionRegenerateModal({ state, onChange, onClose, onStart, onContinue, onConfirm }: Props) {
  const updateDraft = (index: number, patch: Partial<QuestionDraft>) => onChange({
    ...state,
    drafts: state.drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft),
  })
  const completed = state.progress.completed
  const total = state.progress.total

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget && !state.processing && !state.saving) onClose() }}>
    <section className="editor-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="regenerate-title">
      <div className="modal-header">
        <div><p className="eyebrow">Content refresh</p><h2 id="regenerate-title">重新生成题目内容</h2><p className="modal-subtitle">{state.scopeLabel}</p></div>
        <button className="icon-button" type="button" title="关闭" disabled={state.saving} onClick={onClose}><X size={18} /></button>
      </div>
      {state.awaitingInstructions ? <label className="regenerate-instructions">
        <span>补充生成要求 <small>可选</small></span>
        <textarea rows={5} maxLength={2000} autoFocus value={state.instructions} onChange={(event) => onChange({ ...state, instructions: event.target.value })} placeholder="例如：重点解释 HTTP 强缓存与协商缓存的区别，并给出请求头示例。" />
        <small>AI 会以“{state.questions[0]?.category}”作为首要技术语境，补充要求不会改变题目分类。</small>
      </label> : <div className="import-summary">{state.processing ? <Sparkles size={16} /> : <Check size={16} />} {state.processing ? (state.progress.status || `正在分批生成 ${completed}/${total} 道题目`) : `已生成 ${state.drafts.length}/${total} 道题目，确认后才会覆盖原内容`}</div>}
      {state.error && <p className="form-error regenerate-error">{state.error}</p>}
      {!state.awaitingInstructions && <div className="import-preview-list import-review-list">
        {state.drafts.map((draft, index) => <article className="import-review-card" key={`${state.questions[index]?.id || draft.title}-${index}`}>
          <header><span className="import-review-index">{index + 1}</span><strong>{draft.title}</strong><span>{draft.category} · {draft.difficulty}</span></header>
          <div className="import-review-grid">
            <label><span>答案（Markdown）</span><textarea rows={5} disabled={state.processing || state.saving} value={draft.answer} onChange={(event) => updateDraft(index, { answer: event.target.value })} /></label>
            <label><span>重要性</span><input type="number" min="1" max="5" disabled={state.processing || state.saving} value={draft.importance} onChange={(event) => updateDraft(index, { importance: Math.min(5, Math.max(1, Number(event.target.value) || 1)) })} /></label>
            <label className="full-field"><span>详细解析（Markdown）</span><textarea rows={9} disabled={state.processing || state.saving} value={draft.explanation} onChange={(event) => updateDraft(index, { explanation: event.target.value })} /></label>
            <label className="full-field"><span>面试中建议的回答</span><textarea rows={4} disabled={state.processing || state.saving} value={draft.interviewAnswer} onChange={(event) => updateDraft(index, { interviewAnswer: event.target.value })} /></label>
            <FollowUpEditorFields followUps={draft.followUps} disabled={state.processing || state.saving} onChange={(followUps) => updateDraft(index, { followUps })} hint="重新生成的追问答案会显示在对应问题下方" />
          </div>
        </article>)}
      </div>}
      <div className="modal-actions">
        <button className="quiet-button" type="button" disabled={state.saving} onClick={onClose}>取消，不覆盖</button>
        {state.awaitingInstructions && <button className="primary-button" type="button" onClick={onStart}><Sparkles size={13} />开始生成</button>}
        {state.error && !state.processing && state.drafts.length < total && <button className="quiet-button" type="button" onClick={onContinue}><RefreshCw size={13} />继续生成剩余题目</button>}
        {!state.awaitingInstructions && <button className="primary-button" type="button" disabled={state.processing || state.saving || state.drafts.length !== total} onClick={onConfirm}>{state.saving ? '正在保存…' : `确认覆盖 ${state.drafts.length} 道题`} <Check size={13} /></button>}
      </div>
    </section>
  </div>
}
