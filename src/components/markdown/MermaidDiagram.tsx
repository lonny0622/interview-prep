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

export function MermaidDiagram({ chart }: { chart: string }) {
  const id = useMemo(() => `interview-mermaid-${++renderSequence}`, [])
  const [imageUrl, setImageUrl] = useState('')
  const [error, setError] = useState('')

  useEffect(() => {
    let cancelled = false
    let nextUrl = ''
    setImageUrl('')
    setError('')

    void loadMermaid()
      .then((mermaid) => mermaid.render(id, chart.slice(0, 50_000)))
      .then(({ svg }) => {
        if (cancelled) return
        nextUrl = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }))
        setImageUrl(nextUrl)
      })
      .catch((renderError: unknown) => {
        if (!cancelled) setError(renderError instanceof Error ? renderError.message : '图表语法无法解析')
      })

    return () => {
      cancelled = true
      if (nextUrl) URL.revokeObjectURL(nextUrl)
    }
  }, [chart, id])

  if (error) return <figure className="mermaid-diagram is-error"><figcaption>Mermaid 图表渲染失败：{error}</figcaption><pre><code>{chart}</code></pre></figure>
  if (!imageUrl) return <div className="mermaid-diagram is-loading" role="status">正在生成图表…</div>
  return <figure className="mermaid-diagram"><img src={imageUrl} alt="AI 生成的 Mermaid 图表" /></figure>
}
