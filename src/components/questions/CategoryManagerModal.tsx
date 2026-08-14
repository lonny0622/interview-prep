import { Check, Pencil, Plus, Trash2, X } from 'lucide-react'
import { useState } from 'react'

export type QuestionCategory = {
  id: string
  name: string
  sortOrder: number
  questionCount: number
}

type Props = {
  categories: QuestionCategory[]
  onClose: () => void
  onCreate: (name: string) => Promise<void>
  onRename: (category: QuestionCategory, name: string) => Promise<void>
  onDelete: (category: QuestionCategory) => Promise<void>
}

export function CategoryManagerModal({ categories, onClose, onCreate, onRename, onDelete }: Props) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [pending, setPending] = useState<string | null>(null)
  const [error, setError] = useState('')

  const run = async (key: string, action: () => Promise<void>) => {
    setPending(key)
    setError('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '分类操作失败。')
    } finally {
      setPending(null)
    }
  }

  const create = () => {
    const name = newName.trim()
    if (!name) { setError('请输入分类名称。'); return }
    void run('create', async () => { await onCreate(name); setNewName('') })
  }

  const rename = (category: QuestionCategory) => {
    const name = editingName.trim()
    if (!name) { setError('请输入分类名称。'); return }
    void run(`rename:${category.id}`, async () => { await onRename(category, name); setEditingId(null); setEditingName('') })
  }

  const remove = (category: QuestionCategory) => {
    if (category.questionCount > 0) return
    void run(`delete:${category.id}`, () => onDelete(category))
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="editor-modal category-manager-modal" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
      <div className="modal-header"><div><p className="eyebrow">Question taxonomy</p><h2 id="category-manager-title">管理题目分类</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></div>
      <div className="category-manager-body">
        <div className="category-create-row"><input value={newName} onChange={(event) => { setNewName(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') create() }} placeholder="新分类名称，例如：React Native 基础" /><button className="primary-button" type="button" disabled={pending !== null} onClick={create}><Plus size={14} />新建分类</button></div>
        {error && <p className="form-error category-manager-error">{error}</p>}
        <div className="category-list" aria-label="题目分类列表">{categories.map((category) => <div className="category-row" key={category.id}>{editingId === category.id ? <><input value={editingName} autoFocus onChange={(event) => { setEditingName(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') rename(category); if (event.key === 'Escape') setEditingId(null) }} /><div className="category-row-actions"><button className="quiet-button" type="button" disabled={pending !== null} onClick={() => rename(category)}><Check size={13} />保存</button><button className="icon-button" type="button" title="取消编辑" onClick={() => setEditingId(null)}><X size={14} /></button></div></> : <><div><strong>{category.name}</strong><span>{category.questionCount} 道题目</span></div><div className="category-row-actions"><button className="icon-button" type="button" title={`编辑${category.name}`} disabled={pending !== null} onClick={() => { setEditingId(category.id); setEditingName(category.name); setError('') }}><Pencil size={14} /></button><button className="icon-button danger-icon" type="button" title={category.questionCount ? '分类下有题目，不能删除' : `删除${category.name}`} disabled={pending !== null || category.questionCount > 0} onClick={() => remove(category)}><Trash2 size={14} /></button></div></>}</div>)}</div>
        {!categories.length && <p className="profile-empty">还没有分类，先创建一个吧。</p>}
        <p className="category-manager-hint">重命名会同步更新该分类下的所有题目；分类下仍有题目时不能删除。</p>
      </div>
      <div className="modal-actions"><button className="quiet-button" type="button" onClick={onClose}>完成</button></div>
    </section>
  </div>
}
