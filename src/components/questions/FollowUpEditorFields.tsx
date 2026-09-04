import { Plus, Trash2 } from 'lucide-react'
import type { FollowUp } from '../../types/question'

type Props = {
  followUps: FollowUp[]
  onChange: (followUps: FollowUp[]) => void
  disabled?: boolean
  hint?: string
}

const MAX_FOLLOW_UPS = 10

export function FollowUpEditorFields({ followUps, onChange, disabled = false, hint = '每条追问都可以单独查看和编辑回答' }: Props) {
  const update = (index: number, patch: Partial<FollowUp>) => {
    onChange(followUps.map((followUp, followUpIndex) => followUpIndex === index ? { ...followUp, ...patch } : followUp))
  }

  const remove = (index: number) => onChange(followUps.filter((_, followUpIndex) => followUpIndex !== index))
  const add = () => {
    if (followUps.length >= MAX_FOLLOW_UPS) return
    onChange([...followUps, { question: '', answer: '' }])
  }

  return <section className="follow-up-editor-fields full-field">
    <div className="follow-up-editor-heading">
      <div><strong>发散问题与回答</strong><small>{hint}</small></div>
      <button className="secondary-button" type="button" disabled={disabled || followUps.length >= MAX_FOLLOW_UPS} onClick={add}><Plus size={13} />添加追问</button>
    </div>
    {followUps.length ? <div className="follow-up-editor-list">
      {followUps.map((followUp, index) => <div className="follow-up-editor-item" key={index}>
        <div className="follow-up-editor-item-heading"><span>追问 {index + 1}</span><button className="icon-button" type="button" title={`删除追问 ${index + 1}`} disabled={disabled} onClick={() => remove(index)}><Trash2 size={14} /></button></div>
        <label><span>问题</span><textarea rows={2} disabled={disabled} value={followUp.question} onChange={(event) => update(index, { question: event.target.value })} /></label>
        <label><span>回答（Markdown）</span><textarea rows={4} disabled={disabled} value={followUp.answer} onChange={(event) => update(index, { answer: event.target.value })} placeholder="尚未生成回答，可先留空，导入后再单独生成。" /></label>
      </div>)}
    </div> : <p className="follow-up-editor-empty">暂无发散问题，可以点击“添加追问”。</p>}
  </section>
}
