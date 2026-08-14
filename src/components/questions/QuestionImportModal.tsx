import { ArrowLeft, Check, FileUp, Sparkles, X } from 'lucide-react'

export type ImportDraft = {
  title: string
  category: string
  difficulty: '简单' | '中等' | '困难'
  importance: number
  answer: string
  explanation: string
  interviewAnswer: string
  followUps: string[]
}

export type QuestionImporterState = {
  step: 'input' | 'preview'
  source: string
  category: string
  drafts: ImportDraft[]
  error: string
  processing: boolean
}

type Props = {
  state: QuestionImporterState
  onChange: (state: QuestionImporterState) => void
  onClose: () => void
  onLocalParse: () => void
  onGenerate: () => void
  onConfirm: () => void
}

export function QuestionImportModal({ state, onChange, onClose, onLocalParse, onGenerate, onConfirm }: Props) {
  const source = String(state.source || '')
  const category = String(state.category || '')
  const error = String(state.error || '')
  const drafts = Array.isArray(state.drafts) ? state.drafts : []
  const updateDraft = (index: number, patch: Partial<ImportDraft>) => onChange({ ...state, drafts: drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft) })
  const updateFollowUps = (index: number, value: string) => updateDraft(index, { followUps: value.split('\n').map((item) => item.trim()).filter(Boolean) })
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="editor-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-header"><div><p className="eyebrow">Question import</p><h2 id="import-title">{state.step === 'input' ? '批量生成题库内容' : '审核生成内容'}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></div>{state.step === 'input' ? <><div className="import-hint"><FileUp size={20} /><div><strong>粘贴题目列表，只需要题目</strong><p>第一行可以写分类，使用 ⭐ Level 1/2/3 表示难度。系统会生成答案、详细解析（含速记）、建议回答和发散问题，并在写入前让你逐题审核。</p></div></div><label className="import-category-field"><span>分类（可选）</span><input value={category} onChange={(event) => onChange({ ...state, category: event.target.value, error: '' })} placeholder="例如：React Native 基础；也可以从第一行自动识别" /></label><textarea className="import-textarea" value={source} onChange={(event) => onChange({ ...state, source: event.target.value, error: '' })} placeholder={'示例：\n一、React Native 基础\n⭐ Level 1：基础概念\nReact Native 和 React Web 的核心区别是什么？\nReact Native 为什么可以实现跨平台？'} />{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button className="quiet-button" type="button" onClick={onClose}>取消</button><button className="quiet-button" type="button" disabled={state.processing || !source.trim()} onClick={onLocalParse}>解析已有完整内容</button><button className="primary-button" type="button" disabled={state.processing || !source.trim()} onClick={onGenerate}>{state.processing ? '正在生成并校验…' : '生成答案并预览'} <Sparkles size={13} /></button></div></> : <><div className="import-summary"><Check size={16} /> 已生成 {drafts.length} 道题目，请逐题检查后再导入</div><div className="import-preview-list import-review-list">{drafts.map((draft, index) => <article className="import-review-card" key={`${String(draft.title || '')}-${index}`}><header><span className="import-review-index">{index + 1}</span><strong>{draft.title}</strong><span>{draft.category} · {draft.difficulty}</span></header><div className="import-review-grid"><label><span>问题</span><textarea rows={2} value={draft.title} onChange={(event) => updateDraft(index, { title: event.target.value })} /></label><label><span>难度 / 重要性</span><div className="import-review-meta"><select value={draft.difficulty} onChange={(event) => updateDraft(index, { difficulty: event.target.value as ImportDraft['difficulty'] })}><option>简单</option><option>中等</option><option>困难</option></select><input type="number" min="1" max="5" value={draft.importance} onChange={(event) => updateDraft(index, { importance: Math.min(5, Math.max(1, Number(event.target.value) || 1)) })} /></div></label><label className="full-field"><span>答案（Markdown）</span><textarea rows={5} value={draft.answer} onChange={(event) => updateDraft(index, { answer: event.target.value })} /></label><label className="full-field"><span>详细解析（Markdown，必须包含速记）</span><textarea rows={9} value={draft.explanation} onChange={(event) => updateDraft(index, { explanation: event.target.value })} /></label><label className="full-field"><span>面试中建议的回答</span><textarea rows={4} value={draft.interviewAnswer} onChange={(event) => updateDraft(index, { interviewAnswer: event.target.value })} /></label><label className="full-field"><span>发散问题（每行一个）</span><textarea rows={3} value={Array.isArray(draft.followUps) ? draft.followUps.join('\n') : ''} onChange={(event) => updateFollowUps(index, event.target.value)} /></label></div></article>)}</div><div className="modal-actions"><button className="quiet-button" type="button" onClick={() => onChange({ ...state, step: 'input', error: '' })}><ArrowLeft size={13} />返回修改</button><button className="primary-button" type="button" onClick={onConfirm}>确认导入 {drafts.length} 道题 <Check size={13} /></button></div></>}</section></div>
}
