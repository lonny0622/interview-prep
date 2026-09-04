import { Braces, X } from 'lucide-react'
import { useState } from 'react'
import { parseStructuredQuestion } from '../../features/questionImport'
import type { Difficulty, QuestionEditorState } from '../../types/question'
import { FollowUpEditorFields } from './FollowUpEditorFields'

type Props = {
  editor: QuestionEditorState
  onChange: (editor: QuestionEditorState) => void
  onClose: () => void
  onSave: () => void
}

export function QuestionEditorModal({ editor, onChange, onClose, onSave }: Props) {
  const [structuredOpen, setStructuredOpen] = useState(false)
  const [structuredSource, setStructuredSource] = useState('')
  const [structuredError, setStructuredError] = useState('')

  const updateDraft = (patch: Partial<QuestionEditorState['draft']>) => {
    onChange({ ...editor, draft: { ...editor.draft, ...patch } })
  }

  const toggleStructuredEditor = () => {
    if (!structuredOpen && !structuredSource) setStructuredSource(JSON.stringify(editor.draft, null, 2))
    setStructuredError('')
    setStructuredOpen((open) => !open)
  }

  const applyStructuredQuestion = () => {
    try {
      const draft = parseStructuredQuestion(structuredSource)
      onChange({ ...editor, draft })
      setStructuredSource(JSON.stringify(draft, null, 2))
      setStructuredError('')
      setStructuredOpen(false)
    } catch (error) {
      setStructuredError(error instanceof Error ? error.message : '结构化数据无法解析。')
    }
  }

  return <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className="editor-modal" role="dialog" aria-modal="true" aria-labelledby="editor-title">
      <div className="modal-header">
        <div><p className="eyebrow">Question editor</p><h2 id="editor-title">{editor.mode === 'create' ? '新建题目' : '编辑题目'}</h2></div>
        <div className="modal-header-actions">
          <button className="secondary-button" type="button" aria-expanded={structuredOpen} onClick={toggleStructuredEditor}><Braces size={14} />结构化覆盖</button>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button>
        </div>
      </div>
      <div className="editor-grid">
        {structuredOpen && <section className="structured-question-editor full-field">
          <div><strong>使用 JSON 覆盖当前题目</strong><p>支持单个对象、只含一项的数组或 <code>{'{ "questions": [...] }'}</code>。解析后先覆盖下方表单，点击“保存题目”才会写入数据库。</p></div>
          <textarea rows={14} value={structuredSource} spellCheck={false} onChange={(event) => { setStructuredSource(event.target.value); setStructuredError('') }} placeholder={'{\n  "title": "问题",\n  "category": "分类",\n  "difficulty": "中等",\n  "importance": 3,\n  "answer": "直接答案",\n  "explanation": "详细解析",\n  "interviewAnswer": "面试回答",\n  "followUps": [{ "question": "追问", "answer": "回答" }]\n}'} />
          {structuredError && <p className="form-error">{structuredError}</p>}
          <div className="structured-question-actions"><button className="quiet-button" type="button" onClick={() => setStructuredOpen(false)}>取消</button><button className="primary-button" type="button" disabled={!structuredSource.trim()} onClick={applyStructuredQuestion}>解析并覆盖表单</button></div>
        </section>}
        <label className="full-field"><span>问题</span><textarea rows={3} value={editor.draft.title} onChange={(event) => updateDraft({ title: event.target.value })} placeholder="输入面试问题" /></label>
        <label><span>分类</span><input value={editor.draft.category} onChange={(event) => updateDraft({ category: event.target.value })} placeholder="例如 React" /></label>
        <label><span>难度</span><select value={editor.draft.difficulty} onChange={(event) => updateDraft({ difficulty: event.target.value as Difficulty })}><option>简单</option><option>中等</option><option>困难</option></select></label>
        <label><span>重要性</span><input type="number" min="1" max="5" value={editor.draft.importance} onChange={(event) => updateDraft({ importance: Number(event.target.value) })} /></label>
        <label className="full-field"><span>答案（Markdown）</span><textarea rows={5} value={editor.draft.answer} onChange={(event) => updateDraft({ answer: event.target.value })} /></label>
        <label className="full-field"><span>详细解析（Markdown）</span><textarea rows={5} value={editor.draft.explanation} onChange={(event) => updateDraft({ explanation: event.target.value })} /></label>
        <label className="full-field"><span>面试时建议的回答</span><textarea rows={4} value={editor.draft.interviewAnswer} onChange={(event) => updateDraft({ interviewAnswer: event.target.value })} /></label>
        <FollowUpEditorFields followUps={editor.draft.followUps} onChange={(followUps) => updateDraft({ followUps })} />
      </div>
      <div className="modal-actions">
        <button className="quiet-button" type="button" onClick={onClose}>取消</button>
        <button className="primary-button" type="button" disabled={!editor.draft.title.trim() || !editor.draft.category.trim()} onClick={onSave}>保存题目</button>
      </div>
    </section>
  </div>
}
