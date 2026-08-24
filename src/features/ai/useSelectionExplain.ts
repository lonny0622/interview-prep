import { useCallback, useEffect, useRef, useState } from 'react'
import { aiApi } from '../../api/aiApi'
import type { ExplainDialogState, ExplainSession } from '../../types/ai'
import type { Question } from '../../types/question'
import { loadExplainSessions, saveExplainSessions, toExplainSession } from './explainHistory'

function createSessionId(): string {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

export function useSelectionExplain() {
  const [dialog, setDialog] = useState<ExplainDialogState | null>(null)
  const [sessions, setSessions] = useState<ExplainSession[]>(loadExplainSessions)
  const [open, setOpen] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)
  const abortRef = useRef<AbortController | null>(null)
  const dialogRef = useRef<ExplainDialogState | null>(null)

  useEffect(() => saveExplainSessions(sessions), [sessions])
  useEffect(() => { dialogRef.current = dialog }, [dialog])

  const saveSession = useCallback((session: ExplainSession) => {
    if (!session.messages.some((message) => message.role === 'user')) return
    setSessions((current) => [toExplainSession(session), ...current.filter((item) => item.id !== session.id)])
  }, [])

  const openFromContextMenu = useCallback((event: React.MouseEvent<HTMLElement>, question: Question) => {
    const selectedText = window.getSelection()?.toString().trim() || ''
    if (!selectedText) return
    event.preventDefault()
    abortRef.current?.abort()
    const previous = dialogRef.current
    if (previous) saveSession(previous)
    const now = new Date().toISOString()
    const next = { id: createSessionId(), question, selectedText, messages: [], createdAt: now, updatedAt: now, input: '', streaming: false, error: '' }
    dialogRef.current = next
    setDialog(next)
    setHistoryOpen(false)
    setOpen(true)
  }, [saveSession])

  const close = useCallback(() => {
    abortRef.current?.abort()
    abortRef.current = null
    const current = dialogRef.current
    if (current) {
      const stopped = { ...current, streaming: false }
      dialogRef.current = stopped
      setDialog(stopped)
      saveSession(stopped)
    }
    setOpen(false)
  }, [saveSession])

  const openHistory = useCallback(() => {
    abortRef.current?.abort()
    const current = dialogRef.current
    if (current?.streaming) {
      const stopped = { ...current, streaming: false }
      dialogRef.current = stopped
      setDialog(stopped)
      saveSession(stopped)
    }
    setHistoryOpen(true)
    setOpen(true)
  }, [saveSession])

  const toggleHistory = useCallback(() => setHistoryOpen((current) => dialogRef.current ? !current : true), [])

  const selectSession = useCallback((session: ExplainSession) => {
    abortRef.current?.abort()
    const next = { ...session, input: '', streaming: false, error: '' }
    dialogRef.current = next
    setDialog(next)
    setHistoryOpen(false)
    setOpen(true)
  }, [])

  const deleteSession = useCallback((id: string) => {
    setSessions((current) => current.filter((session) => session.id !== id))
    if (dialogRef.current?.id === id) {
      abortRef.current?.abort()
      abortRef.current = null
      dialogRef.current = null
      setDialog(null)
    }
  }, [])

  const setInput = useCallback((input: string) => {
    const current = dialogRef.current
    if (!current) return
    const next = { ...current, input }
    dialogRef.current = next
    setDialog(next)
  }, [])

  const updateDialog = useCallback((update: (current: ExplainDialogState) => ExplainDialogState) => {
    const current = dialogRef.current
    if (!current) return
    const next = update(current)
    dialogRef.current = next
    setDialog(next)
  }, [])

  const finishRequest = useCallback((error = '') => {
    const current = dialogRef.current
    if (!current) return
    const messages = error && !current.messages.at(-1)?.content ? current.messages.slice(0, -1) : current.messages
    const completed = { ...current, messages, streaming: false, error, updatedAt: new Date().toISOString() }
    dialogRef.current = completed
    setDialog(completed)
    saveSession(completed)
  }, [saveSession])

  const ask = useCallback(async () => {
    if (!dialog || dialog.streaming || !dialog.input.trim()) return
    const prompt = dialog.input.trim()
    const history = dialog.messages
    const controller = new AbortController()
    const updatedAt = new Date().toISOString()
    abortRef.current?.abort()
    abortRef.current = controller
    const userMessage = { role: 'user' as const, content: prompt }
    const assistantMessage = { role: 'assistant' as const, content: '' }
    const started = { ...dialog, input: '', messages: [...dialog.messages, userMessage, assistantMessage], streaming: true, error: '', updatedAt }
    dialogRef.current = started
    setDialog(started)
    saveSession({ ...started, messages: [...dialog.messages, userMessage] })
    try {
      await aiApi.explainSelection({ question: dialog.question, selectedText: dialog.selectedText, prompt, history }, (content) => {
        updateDialog((current) => {
          const messages = [...current.messages]
          const last = messages.at(-1)
          if (!last || last.role !== 'assistant') return current
          messages[messages.length - 1] = { ...last, content: `${last.content}${content}` }
          return { ...current, messages }
        })
      }, controller.signal)
      finishRequest()
    } catch (error) {
      if (controller.signal.aborted) return
      finishRequest(error instanceof Error ? error.message : 'AI 解释失败。')
    } finally {
      if (abortRef.current === controller) abortRef.current = null
    }
  }, [dialog, finishRequest, saveSession, updateDialog])

  return { dialog, sessions, open, historyOpen, openFromContextMenu, openHistory, toggleHistory, selectSession, deleteSession, close, setInput, ask }
}
