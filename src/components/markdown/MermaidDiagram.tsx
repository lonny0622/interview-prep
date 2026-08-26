import { useEffect, useMemo, useState } from 'react'

let renderSequence = 0
let mermaidPromise: Promise<typeof import('mermaid')['default']> | null = null

function loadMermaid() {
  mermaidPromise ??= import('mermaid').then(({ default: mermaid }) => {
    mermaid.initialize({
      startOnLoad: false,
      securityLevel: 'strict',
      theme: 'neutral',
      suppressErrorRendering: true,
      maxTextSize: 50_000,
      fontFamily: 'Inter, ui-sans-serif, system-ui, sans-serif',
    })
    return mermaid
  })
  return mermaidPromise
}

function normalizeMermaidSource(chart: string): string {
  return chart
    .trim()
    .replace(/^```(?:mermaid)?\s*/i, '')
    .replace(/```\s*$/, '')
    .replace(/^mermaid\s*\n/i, '')
    .replace(/\r\n?/g, '\n')
    .replace(/[“”]/g, '"')
    .replace(/[‘’]/g, "'")
    .replace(/\u00a0/g, ' ')
    .trim()
}

function quoteMermaidNodeLabels(source: string): string {
  const quote = (label: string) => {
    const trimmed = label.trim()
    if (/^(["']).*\1$/.test(trimmed)) return trimmed
    return `"${trimmed.replace(/"/g, '&quot;')}"`
  }
  return source
    .replace(/\b([A-Za-z_][\w-]*)\[([^\n]+?)\]/g, (match, id: string, label: string) => label.trim().startsWith('[') ? match : `${id}[${quote(label)}]`)
    .replace(/\b([A-Za-z_][\w-]*)\{([^{}\n]+)\}/g, (_match, id: string, label: string) => `${id}{${quote(label)}}`)
    .replace(/\b([A-Za-z_][\w-]*)\(([^()\n]+)\)/g, (_match, id: string, label: string) => `${id}(${quote(label)})`)
}

function withoutOptionalDirectives(source: string): string {
  return source.split('\n').filter((line) => !/^\s*(?:style|classDef|class|linkStyle|click)\s+/i.test(line)).join('\n')
}

function hasDiagramDeclaration(source: string): boolean {
  return /^\s*(?:---[\s\S]*?---\s*)?(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram(?:-v2)?|erDiagram|journey|gantt|pie|mindmap|timeline|gitGraph|quadrantChart|requirementDiagram|C4\w*)\b/im.test(source)
}

function mermaidCandidates(chart: string): string[] {
  const normalized = normalizeMermaidSource(chart)
  const quoted = quoteMermaidNodeLabels(normalized)
  const simplified = withoutOptionalDirectives(quoted)
  const candidates = [normalized, quoted, simplified]
  if (simplified && !hasDiagramDeclaration(simplified)) candidates.push(`flowchart TD\n${simplified}`)
  return [...new Set(candidates.filter(Boolean))]
}

export function MermaidDiagram({ chart }: { chart: string }) {
  const id = useMemo(() => `interview-mermaid-${++renderSequence}`, [])
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState('')
  const [repaired, setRepaired] = useState(false)

  useEffect(() => {
    let cancelled = false
    let nextUrl = ''
    setImageUrl('')
    setError('')
    setRepaired(false)

    void loadMermaid()
      .then(async (mermaid) => {
        const candidates = mermaidCandidates(chart.slice(0, 50_000))
        let lastError: unknown
        for (let index = 0; index < candidates.length; index += 1) {
          try {
            const result = await mermaid.render(`${id}-${index}`, candidates[index])
            return { ...result, repaired: index > 0 }
          } catch (renderError) {
            lastError = renderError
          }
        }
        throw lastError || new Error('图表内容为空')
      })
      .then(({ svg, repaired: wasRepaired }) => {
        if (cancelled) return
        nextUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        setRepaired(wasRepaired)
        setImageUrl(nextUrl)
      })
      .catch((renderError: unknown) => {
        if (!cancelled) {
          const message = renderError instanceof Error ? renderError.message.split('\n')[0] : '图表语法无法解析'
          setError(message.slice(0, 240))
        }
      })

    return () => {
      cancelled = true
      if (nextUrl) URL.revokeObjectURL(nextUrl)
    }
  }, [chart, id])

  if (error) return <figure className="mermaid-diagram is-error"><figcaption>Mermaid 图表格式有误，自动修复后仍无法渲染：{error}</figcaption><details><summary>查看原始图表代码</summary><pre><code>{chart}</code></pre></details></figure>
  if (!imageUrl) return <div className="mermaid-diagram is-loading" role="status">正在生成图表…</div>
  return <figure className="mermaid-diagram">{repaired && <figcaption>已自动修复图表格式</figcaption>}<img src={imageUrl} alt="AI 生成的 Mermaid 图表" /></figure>
}
