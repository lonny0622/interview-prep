import { Check, MoveRight, Pencil, Plus, Sparkles, Trash2, X } from 'lucide-react'
import { useState } from 'react'
import type { QuestionCategory } from '../../types/question'

type Props = {
  categories: QuestionCategory[]
  onClose: () => void
  onCreate: (name: string) => Promise<void>
  onRename: (category: QuestionCategory, name: string) => Promise<void>
  onDelete: (category: QuestionCategory) => Promise<void>
  onMoveQuestions: (source: QuestionCategory, targetId: string) => Promise<void>
  onRegenerate: (category: QuestionCategory) => void
}

const RESERVED_CATEGORY_NAME = '未分类'

export function CategoryManagerModal({ categories, onClose, onCreate, onRename, onDelete, onMoveQuestions, onRegenerate }: Props) {
  const [newName, setNewName] = useState('')
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editingName, setEditingName] = useState('')
  const [movingId, setMovingId] = useState<string | null>(null)
  const [targetCategoryId, setTargetCategoryId] = useState('')
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

  const startMove = (category: QuestionCategory) => {
    setMovingId(category.id)
    setTargetCategoryId(categories.find((item) => item.id !== category.id)?.id ?? '')
    setEditingId(null)
    setError('')
  }

  const moveQuestions = (category: QuestionCategory) => {
    if (!targetCategoryId) { setError('请先新建一个目标分类。'); return }
    const target = categories.find((item) => item.id === targetCategoryId)
    if (!target) { setError('目标分类不存在，请重新选择。'); return }
    if (!window.confirm(`确认将“${category.name}”下的 ${category.questionCount} 道题目迁移到“${target.name}”？`)) return
    void run(`move:${category.id}`, async () => {
      await onMoveQuestions(category, target.id)
      setMovingId(null)
      setTargetCategoryId('')
    })
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="editor-modal category-manager-modal" role="dialog" aria-modal="true" aria-labelledby="category-manager-title">
      <div className="modal-header"><div><p className="eyebrow">Question taxonomy</p><h2 id="category-manager-title">管理题目分类</h2></div><button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button></div>
      <div className="category-manager-body">
        <div className="category-create-row"><input value={newName} onChange={(event) => { setNewName(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') create() }} placeholder="新分类名称，例如：React Native 基础" /><button className="primary-button" type="button" disabled={pending !== null} onClick={create}><Plus size={14} />新建分类</button></div>
        {error && <p className="form-error category-manager-error">{error}</p>}
        <div className="category-list" aria-label="题目分类列表">{categories.map((category) => {
          const reserved = category.name === RESERVED_CATEGORY_NAME
          if (movingId === category.id) return <div className="category-row category-moving-row" key={category.id}>
            <div className="category-move-editor">
              <span>将 {category.questionCount} 道题目迁移到</span>
              <select value={targetCategoryId} autoFocus onChange={(event) => { setTargetCategoryId(event.target.value); setError('') }}>
                {categories.filter((item) => item.id !== category.id).map((item) => <option value={item.id} key={item.id}>{item.name}</option>)}
              </select>
            </div>
            <div className="category-row-actions"><button className="quiet-button" type="button" disabled={pending !== null || !targetCategoryId} onClick={() => moveQuestions(category)}><Check size={13} />确认迁移</button><button className="icon-button" type="button" title="取消迁移" onClick={() => { setMovingId(null); setTargetCategoryId('') }}><X size={14} /></button></div>
          </div>
          if (editingId === category.id) return <div className="category-row" key={category.id}><input value={editingName} autoFocus onChange={(event) => { setEditingName(event.target.value); setError('') }} onKeyDown={(event) => { if (event.key === 'Enter') rename(category); if (event.key === 'Escape') setEditingId(null) }} /><div className="category-row-actions"><button className="quiet-button" type="button" disabled={pending !== null} onClick={() => rename(category)}><Check size={13} />保存</button><button className="icon-button" type="button" title="取消编辑" onClick={() => setEditingId(null)}><X size={14} /></button></div></div>
          return <div className="category-row" key={category.id}><div><div className="category-name-line"><strong>{category.name}</strong>{reserved && <span className="category-reserved-badge">系统保留</span>}</div><span>{category.questionCount} 道题目</span></div><div className="category-row-actions"><button className="quiet-button" type="button" title={`重新生成“${category.name}”分类下的题目内容`} disabled={pending !== null || category.questionCount === 0} onClick={() => onRegenerate(category)}><Sparkles size={13} />重生成</button>{reserved ? <button className="quiet-button" type="button" title={category.questionCount ? '批量迁移题目' : '当前没有需要迁移的题目'} disabled={pending !== null || category.questionCount === 0 || categories.length < 2} onClick={() => startMove(category)}><MoveRight size={13} />迁移题目</button> : <><button className="icon-button" type="button" title={`编辑${category.name}`} disabled={pending !== null} onClick={() => { setEditingId(category.id); setEditingName(category.name); setMovingId(null); setError('') }}><Pencil size={14} /></button><button className="icon-button danger-icon" type="button" title={category.questionCount ? '分类下有题目，不能删除' : `删除${category.name}`} disabled={pending !== null || category.questionCount > 0} onClick={() => remove(category)}><Trash2 size={14} /></button></>}</div></div>
        })}</div>
        {!categories.length && <p className="profile-empty">还没有分类，先创建一个吧。</p>}
        <p className="category-manager-hint">“未分类”是系统保留分类，不能改名或删除，可将其中题目批量迁移到其他分类。普通分类重命名时会同步更新其题目。</p>
      </div>
      <div className="modal-actions"><button className="quiet-button" type="button" onClick={onClose}>完成</button></div>
    </section>
  </div>
}
