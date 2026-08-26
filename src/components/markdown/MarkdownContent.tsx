import type { Components } from 'react-markdown'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { MermaidDiagram } from './MermaidDiagram'

function markdownComponents(deferMermaid: boolean): Components {
  return {
    code({ className, children, node, ...props }) {
      void node
      const content = String(children).replace(/\n$/, '')
      if (/(^|\s)language-mermaid(\s|$)/.test(className || '')) {
        return deferMermaid
          ? <div className="mermaid-diagram is-loading" role="status">图表内容生成中…</div>
          : <MermaidDiagram chart={content} />
      }
      return <code className={className} {...props}>{children}</code>
    },
  }
}

export function MarkdownContent({ children, deferMermaid = false }: { children: string; deferMermaid?: boolean }) {
  return <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents(deferMermaid)}>{children}</ReactMarkdown>
}
