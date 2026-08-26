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
    let animationFrame = 0

    const clearAction = () => setAction((current) => current ? null : current)

    const updateSelection = () => {
      const selection = window.getSelection()
      const container = containerRef.current
      if (!selection || selection.isCollapsed || !container || selection.rangeCount === 0) {
        clearAction()
        return
      }

      const range = selection.getRangeAt(0)
      if (!container.contains(range.commonAncestorContainer)) {
        clearAction()
        return
      }

      const text = selection.toString().trim().slice(0, 4000)
      const rect = range.getBoundingClientRect()
      if (!text || (!rect.width && !rect.height)) {
        clearAction()
        return
      }

      const left = Math.round(Math.min(Math.max(rect.left + rect.width / 2, 52), window.innerWidth - 52))
      const top = Math.round(rect.top > 58 ? rect.top - 42 : Math.min(rect.bottom + 12, window.innerHeight - 48))
      setAction((current) => current?.text === text && current.left === left && current.top === top ? current : { text, left, top })
    }

    const scheduleSelectionUpdate = () => {
      if (animationFrame) return
      animationFrame = window.requestAnimationFrame(() => {
        animationFrame = 0
        updateSelection()
      })
    }

    document.addEventListener('selectionchange', scheduleSelectionUpdate)
    window.addEventListener('resize', clearAction)
    document.addEventListener('scroll', clearAction, true)
    return () => {
      if (animationFrame) window.cancelAnimationFrame(animationFrame)
      document.removeEventListener('selectionchange', scheduleSelectionUpdate)
      window.removeEventListener('resize', clearAction)
      document.removeEventListener('scroll', clearAction, true)
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
