import { ArrowLeft, Check, FileUp, Plus, Sparkles, X } from 'lucide-react'
import { useState } from 'react'
import type { QuestionDraft, QuestionImporterState } from '../../types/question'

type Props = {
  state: QuestionImporterState
  categories: string[]
  onChange: (state: QuestionImporterState) => void
  onClose: () => void
  onCreateCategory: (name: string) => Promise<string>
  onLocalParse: () => void
  onGenerate: () => void
  onConfirm: () => void
}

export function QuestionImportModal({ state, categories, onChange, onClose, onCreateCategory, onLocalParse, onGenerate, onConfirm }: Props) {
  const source = String(state.source || '')
  const category = String(state.category || '')
  const error = String(state.error || '')
  const drafts = Array.isArray(state.drafts) ? state.drafts : []
  const completed = state.progress?.completed ?? drafts.length
  const total = state.progress?.total ?? drafts.length
  const progressStatus = state.progress?.status
  const [creatingCategory, setCreatingCategory] = useState(false)
  const [newCategory, setNewCategory] = useState('')
  const [categoryError, setCategoryError] = useState('')
  const categoryOptions = Array.from(new Set([...(category ? [category] : []), ...categories]))
  const updateDraft = (index: number, patch: Partial<QuestionDraft>) => onChange({ ...state, drafts: drafts.map((draft, draftIndex) => draftIndex === index ? { ...draft, ...patch } : draft) })
  const updateFollowUps = (index: number, value: string) => updateDraft(index, { followUps: value.split('\n').map((item) => item.trim()).filter(Boolean) })
  const createCategory = async () => {
    const name = newCategory.trim()
    if (!name) { setCategoryError('请输入分类名称。'); return }
    try {
      const created = await onCreateCategory(name)
      onChange({ ...state, category: created, error: '' })
      setNewCategory('')
      setCategoryError('')
      setCreatingCategory(false)
    } catch (reason) {
      setCategoryError(reason instanceof Error ? reason.message : '分类创建失败。')
    }
  }
  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}><section className="editor-modal import-modal" role="dialog" aria-modal="true" aria-labelledby="import-title"><div className="modal-header"><div><p className="eyebrow">Question import</p><h2 id="import-title">{state.step === 'input' ? '批量生成题库内容' : '审核生成内容'}</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></div>{state.step === 'input' ? <><div className="import-hint"><FileUp size={20} /><div><strong>粘贴题目列表，只需要题目</strong><p>可以选择已有分类，也可以直接新建分类。未选择时，系统会从文本标题自动识别分类。生成后会先逐题审核，不会直接写入题库。</p></div></div><div className="import-category-field"><span>分类</span><div className="import-category-row"><select value={category} onChange={(event) => { onChange({ ...state, category: event.target.value, error: '' }); setCategoryError('') }}><option value="">从文本自动识别</option>{categoryOptions.map((item) => <option key={item} value={item}>{item}</option>)}</select><button className="secondary-button" type="button" disabled={state.processing} onClick={() => { setCreatingCategory((value) => !value); setCategoryError('') }}><Plus size={13} />新建分类</button></div>{creatingCategory && <div className="import-create-category"><input value={newCategory} autoFocus onChange={(event) => { setNewCategory(event.target.value); setCategoryError('') }} onKeyDown={(event) => { if (event.key === 'Enter') void createCategory(); if (event.key === 'Escape') setCreatingCategory(false) }} placeholder="例如：React Native 基础" /><button className="quiet-button" type="button" disabled={state.processing} onClick={() => void createCategory()}>创建并使用</button></div>}{categoryError && <p className="form-error">{categoryError}</p>}</div><textarea className="import-textarea" value={source} onChange={(event) => onChange({ ...state, source: event.target.value, error: '' })} placeholder={'示例：\n一、React Native 基础\n⭐ Level 1：基础概念\nReact Native 和 React Web 的核心区别是什么？\nReact Native 为什么可以实现跨平台？'} />{error && <p className="form-error">{error}</p>}<div className="modal-actions"><button className="quiet-button" type="button" onClick={onClose}>取消</button><button className="quiet-button" type="button" disabled={state.processing || !source.trim()} onClick={onLocalParse}>解析已有完整内容</button><button className="primary-button" type="button" disabled={state.processing || !source.trim()} onClick={onGenerate}>{state.processing ? '正在生成并校验…' : '生成答案并预览'} <Sparkles size={13} /></button></div></> : <><div className="import-summary">{state.processing ? <Sparkles size={16} /> : <Check size={16} />} {state.processing ? (progressStatus || `正在分批生成 ${completed}/${total} 道题目`) : `已生成 ${drafts.length} 道题目，请逐题检查后再导入`}</div>{error && <p className="form-error">{error}</p>}<div className="import-preview-list import-review-list">{drafts.map((draft, index) => <article className="import-review-card" key={`${String(draft.title || '')}-${index}`}><header><span className="import-review-index">{index + 1}</span><strong>{draft.title}</strong><span>{draft.category} · {draft.difficulty}</span></header><div className="import-review-grid"><label><span>问题</span><textarea rows={2} value={draft.title} onChange={(event) => updateDraft(index, { title: event.target.value })} /></label><label><span>难度 / 重要性</span><div className="import-review-meta"><select value={draft.difficulty} onChange={(event) => updateDraft(index, { difficulty: event.target.value as QuestionDraft['difficulty'] })}><option>简单</option><option>中等</option><option>困难</option></select><input type="number" min="1" max="5" value={draft.importance} onChange={(event) => updateDraft(index, { importance: Math.min(5, Math.max(1, Number(event.target.value) || 1)) })} /></div></label><label className="full-field"><span>答案（Markdown）</span><textarea rows={5} value={draft.answer} onChange={(event) => updateDraft(index, { answer: event.target.value })} /></label><label className="full-field"><span>详细解析（Markdown，必须包含速记）</span><textarea rows={9} value={draft.explanation} onChange={(event) => updateDraft(index, { explanation: event.target.value })} /></label><label className="full-field"><span>面试中建议的回答</span><textarea rows={4} value={draft.interviewAnswer} onChange={(event) => updateDraft(index, { interviewAnswer: event.target.value })} /></label><label className="full-field"><span>发散问题（每行一个）</span><textarea rows={3} value={Array.isArray(draft.followUps) ? draft.followUps.join('\n') : ''} onChange={(event) => updateFollowUps(index, event.target.value)} /></label></div></article>)}</div><div className="modal-actions"><button className="quiet-button" type="button" disabled={state.processing} onClick={() => onChange({ ...state, step: 'input', error: '' })}><ArrowLeft size={13} />返回修改</button>{error && !state.processing && <button className="quiet-button" type="button" onClick={onGenerate}>{drafts.length < total ? '继续生成剩余题目' : '重新生成'}</button>}<button className="primary-button" type="button" disabled={state.processing || (total > 0 && drafts.length !== total)} onClick={onConfirm}>确认导入 {drafts.length} 道题 <Check size={13} /></button></div></>}</section></div>
}
