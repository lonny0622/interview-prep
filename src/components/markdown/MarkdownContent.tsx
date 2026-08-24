import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidDiagram } from './MermaidDiagram'

const components: Components = {
  code({ className, children, node, ...props }) {
    void node
    const content = String(children).replace(/\n$/, '')
    if (/(^|\s)language-mermaid(\s|$)/.test(className || '')) return <MermaidDiagram chart={content} />
    return <code className={className} {...props}>{children}</code>
  },
}

export function MarkdownContent({ children }: { children: string }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>{children}</ReactMarkdown>
}
