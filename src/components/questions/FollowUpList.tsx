import { ChevronDown, ChevronRight, FilePenLine, Sparkles } from 'lucide-react'
import { useEffect, useState } from 'react'
import { MarkdownContent } from '../markdown/MarkdownContent'
import type { FollowUp, Question } from '../../types/question'

type Props = {
  question: Question
  onEditAnswer: (question: Question, index: number) => void
  onGenerateAnswer: (question: Question, index: number) => void
}

export function FollowUpList({ question, onEditAnswer, onGenerateAnswer }: Props) {
  const [expandedIndex, setExpandedIndex] = useState<number | null>(null)

  useEffect(() => setExpandedIndex(null), [question.id])

  if (!question.followUps.length) return <p className="follow-up-empty-note">还没有发散问题，可通过编辑题目或重新生成答案来补充。</p>

  return <ul className="follow-ups">
    {question.followUps.map((followUp: FollowUp, index) => {
      const expanded = expandedIndex === index
      return <li key={`${followUp.question}-${index}`} className={expanded ? 'is-expanded' : ''}>
        <button className="follow-up-toggle" type="button" aria-expanded={expanded} onClick={() => setExpandedIndex(expanded ? null : index)}>
          <span>{followUp.question}</span>
          {expanded ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        </button>
        {expanded && <div className="follow-up-answer">
          {followUp.answer.trim()
            ? <><MarkdownContent>{followUp.answer}</MarkdownContent><button className="follow-up-edit-button" type="button" onClick={() => onEditAnswer(question, index)}><FilePenLine size={12} />编辑回答</button></>
            : <div className="follow-up-missing"><p>这条追问还没有回答。</p><div><button className="quiet-button" type="button" onClick={() => onEditAnswer(question, index)}><FilePenLine size={12} />手动编辑</button><button className="primary-button" type="button" onClick={() => onGenerateAnswer(question, index)}><Sparkles size={12} />AI 生成回答</button></div></div>}
        </div>}
      </li>
    })}
  </ul>
}
