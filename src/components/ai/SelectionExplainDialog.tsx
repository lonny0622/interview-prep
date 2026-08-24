import { useEffect, useRef } from 'react'
import { ArrowUp, Bot, History, MessageSquareText, Sparkles, Trash2, UserRound, X } from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { ExplainDialogState, ExplainSession } from '../../types/ai'

type Props = {
  state: ExplainDialogState | null
  sessions: ExplainSession[]
  historyOpen: boolean
  onInputChange: (value: string) => void
  onAsk: () => void
  onToggleHistory: () => void
  onSelectSession: (session: ExplainSession) => void
  onDeleteSession: (id: string) => void
  onClose: () => void
}

function formatSessionTime(value: string): string {
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date)
}

function ExplainHistory({ sessions, activeId, onSelect, onDelete }: {
  sessions: ExplainSession[]
  activeId?: string
  onSelect: (session: ExplainSession) => void
  onDelete: (id: string) => void
}) {
  return <aside className="ai-history-panel" aria-label="AI 对话历史">
    <header><div><strong>对话历史</strong><span>{sessions.length} 条会话</span></div></header>
    <div className="ai-history-list">
      {!sessions.length && <div className="ai-history-empty"><MessageSquareText size={20} /><strong>还没有历史对话</strong><p>在题库或学习页选中文字并右键提问后，会话会保存在这里。</p></div>}
      {sessions.map((session) => {
        const firstPrompt = session.messages.find((message) => message.role === 'user')?.content || session.selectedText
        return <article key={session.id} className={`ai-history-item${activeId === session.id ? ' active' : ''}`}>
          <button type="button" onClick={() => onSelect(session)}>
            <strong>{firstPrompt}</strong>
            <span>{session.question.title}</span>
            <small>{formatSessionTime(session.updatedAt)} · {session.messages.filter((message) => message.role === 'user').length} 次提问</small>
          </button>
          <button className="icon-button" type="button" title="删除会话" aria-label="删除会话" onClick={() => onDelete(session.id)}><Trash2 size={14} /></button>
        </article>
      })}
    </div>
  </aside>
}

export function SelectionExplainDialog({ state, sessions, historyOpen, onInputChange, onAsk, onToggleHistory, onSelectSession, onDeleteSession, onClose }: Props) {
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ block: 'end', behavior: state?.streaming ? 'auto' : 'smooth' })
  }, [state?.messages, state?.error, state?.streaming])

  return <div className="modal-backdrop ai-explain-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
    <section className={`ai-explain-dialog${historyOpen ? ' history-visible' : ''}`} role="dialog" aria-modal="true" aria-labelledby="selection-explain-title">
      <header className="ai-explain-header">
        <div className="ai-explain-title"><span className="ai-explain-icon"><Bot size={16} /></span><div><p className="eyebrow">AI 助教</p><h2 id="selection-explain-title">{historyOpen && !state ? '对话历史' : '解释选中的概念'}</h2><p>{historyOpen && !state ? '查看之前的解释并继续追问' : '结合当前题目和选中内容回答'}</p></div></div>
        <div className="ai-explain-header-actions">
          <button className={`ai-history-toggle${historyOpen ? ' active' : ''}`} type="button" title="对话历史" onClick={onToggleHistory}><History size={16} /><span>历史</span>{sessions.length > 0 && <b>{sessions.length}</b>}</button>
          <button className="icon-button" type="button" title="关闭" onClick={onClose}><X size={18} /></button>
        </div>
      </header>
      <div className="ai-explain-body">
        {historyOpen && <ExplainHistory sessions={sessions} activeId={state?.id} onSelect={onSelectSession} onDelete={onDeleteSession} />}
        {state ? <div className="ai-explain-conversation">
          <div className="ai-explain-context"><div><Sparkles size={13} /><span>选中内容</span></div><blockquote>{state.selectedText}</blockquote><small title={state.question.title}>来自：{state.question.title}</small></div>
          <div className="ai-explain-messages" aria-live="polite">
            {!state.messages.length && <div className="ai-explain-empty"><Bot size={20} /><p>可以问我“这句话是什么意思？”或“给一个实际例子”。</p></div>}
            {state.messages.map((message, index) => <article key={`${message.role}-${index}`} className={`ai-message ${message.role}`}>
              <span className="ai-message-avatar" aria-label={message.role === 'user' ? '你' : 'AI'}>{message.role === 'user' ? <UserRound size={14} /> : <Bot size={14} />}</span>
              <div className="ai-message-body"><span className="ai-message-role">{message.role === 'user' ? '你' : 'AI 助教'}</span><div className="ai-message-content">{message.role === 'assistant' ? <ReactMarkdown remarkPlugins={[remarkGfm]}>{message.content || (state.streaming ? '正在思考…' : '')}</ReactMarkdown> : <p>{message.content}</p>}</div></div>
            </article>)}
            {state.error && <div className="ai-explain-error"><strong>暂时无法连接 AI</strong><span>{state.error}</span><small>该会话已保存，可从“历史”中重新打开并继续追问。</small></div>}
            <div ref={messagesEndRef} />
          </div>
          <form className="ai-explain-input" onSubmit={(event) => { event.preventDefault(); onAsk() }}>
            <div className="ai-explain-textarea-wrap"><textarea autoFocus value={state.input} onChange={(event) => onInputChange(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter' && !event.shiftKey) { event.preventDefault(); onAsk() } }} disabled={state.streaming} placeholder="针对选中内容继续提问…" rows={2} /><small>Enter 发送，Shift + Enter 换行</small></div>
            <button className="primary-button" type="submit" disabled={state.streaming || !state.input.trim()} title="发送提问"><ArrowUp size={15} />{state.streaming ? '回答中' : '发送'}</button>
          </form>
        </div> : <div className="ai-no-active-session"><MessageSquareText size={24} /><strong>选择一条历史会话</strong><p>打开后可以查看完整对话，并基于原题目上下文继续追问。</p></div>}
      </div>
    </section>
  </div>
}
