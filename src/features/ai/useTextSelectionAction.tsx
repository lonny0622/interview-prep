import { Sparkles } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'
import type { Question } from '../../types/question'

type SelectionAction = {
  text: string
  left: number
  top: number
}

export function useTextSelectionAction<T extends HTMLElement>(question: Question | undefined, onExplain: (text: string, question: Question) => void) {
  const containerRef = useRef<T>(null)
  const [action, setAction] = useState<SelectionAction | null>(null)

  useEffect(() => {
    setAction(null)
  }, [question?.id])

  useEffect(() => {
    const updateSelection = () => {
      const selection = window.getSelection()
      const container = containerRef.current
      if (!selection || selection.isCollapsed || !container || selection.rangeCount === 0) {
        setAction(null)
        return
      }

      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) {
        setAction(null)
        return
      }

      const text = selection.toString().trim().slice(0, 4000)
      const rect = range.getBoundingClientRect()
      if (!text || (!rect.width && !rect.height)) {
        setAction(null)
        return
      }

      const left = Math.min(Math.max(rect.left + rect.width / 2, 52), window.innerWidth - 52)
      const top = rect.top > 58 ? rect.top - 42 : Math.min(rect.bottom + 12, window.innerHeight - 48)
      setAction({ text, left, top })
    }

    const hideAction = () => setAction(null)
    document.addEventListener('selectionchange', updateSelection)
    window.addEventListener('resize', hideAction)
    document.addEventListener('scroll', hideAction, true)
    return () => {
      document.removeEventListener('selectionchange', updateSelection)
      window.removeEventListener('resize', hideAction)
      document.removeEventListener('scroll', hideAction, true)
    }
  }, [])

  const selectionAction = action && question ? <button
    className="selection-ai-action"
    style={{ left: action.left, top: action.top }}
    type="button"
    onPointerDown={(event) => event.preventDefault()}
    onClick={() => {
      onExplain(action.text, question)
      window.getSelection()?.removeAllRanges()
      setAction(null)
    }}
  ><Sparkles size={13} aria-hidden="true" />问 AI</button> : null

  return { containerRef, selectionAction }
}
