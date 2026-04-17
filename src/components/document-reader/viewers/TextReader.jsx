import { useEffect, useRef, useState } from 'react'
import ReactMarkdown from 'react-markdown'
import { Empty, Spin } from 'antd'
import remarkBreaks from 'remark-breaks'
import remarkGfm from 'remark-gfm'
import { fetchDocumentPreviewBlob } from '../../../services/documentService'
import { findTextMatches, highlightReactNode, renderHighlightedText } from '../highlightUtils'
import RequestErrorState from '../RequestErrorState'
import ViewerZoomControls, { buildViewerZoomStyle, clampViewerZoomLevel } from '../ViewerZoomControls'

function deriveInitialMatchIndex(matches, locator) {
  if (!matches.length) return -1
  if (Number.isFinite(locator?.startOffset)) {
    const byOffset = matches.findIndex((item) => item.start >= locator.startOffset)
    if (byOffset >= 0) return byOffset
  }
  return 0
}

export default function TextReader({
  documentMeta,
  searchQuery,
  locator,
  navRequest,
  onMatchStateChange,
  onActiveSnippetChange,
}) {
  const containerRef = useRef(null)
  const [content, setContent] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const [zoomLevel, setZoomLevel] = useState(1)

  useEffect(() => {
    let cancelled = false

    async function loadText() {
      setLoading(true)
      setError('')
      setAttempts(0)
      setActiveIndex(-1)
      setZoomLevel(1)
      onMatchStateChange?.({ count: 0, activeIndex: -1 })

      try {
        const blob = await fetchDocumentPreviewBlob(documentMeta, {
          onAttempt: (attempt) => {
            if (!cancelled) setAttempts(attempt)
          },
        })
        const text = await blob.text()
        if (!cancelled) setContent(text)
      } catch (err) {
        if (!cancelled) setError(err?.message || '文本预览加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadText()
    return () => {
      cancelled = true
    }
  }, [documentMeta, onMatchStateChange])

  const matches = findTextMatches(content, searchQuery)
  const isMarkdown = documentMeta?.ext === 'md' || documentMeta?.ext === 'markdown'

  useEffect(() => {
    if (!matches.length) {
      setActiveIndex(-1)
      onMatchStateChange?.({ count: 0, activeIndex: -1 })
      return
    }

    const nextIndex = deriveInitialMatchIndex(matches, locator)
    setActiveIndex(nextIndex)
    onMatchStateChange?.({ count: matches.length, activeIndex: nextIndex })
  }, [locator, matches, onMatchStateChange])

  useEffect(() => {
    if (!navRequest || !matches.length) return
    setActiveIndex((current) => {
      const next = navRequest.direction === 'prev'
        ? (current <= 0 ? matches.length - 1 : current - 1)
        : (current >= matches.length - 1 ? 0 : current + 1)
      onMatchStateChange?.({ count: matches.length, activeIndex: next })
      return next
    })
  }, [matches, navRequest, onMatchStateChange])

  useEffect(() => {
    if (activeIndex < 0) return
    const timer = window.setTimeout(() => {
      containerRef.current
        ?.querySelector(`[data-match-index="${activeIndex}"]`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }, 40)
    return () => window.clearTimeout(timer)
  }, [activeIndex, content, searchQuery])

  useEffect(() => {
    if (activeIndex < 0 || !matches.length) return
    const activeMatch = matches[activeIndex]
    if (!activeMatch) return

    const start = Math.max(0, activeMatch.start - 28)
    const end = Math.min(content.length, activeMatch.end + 56)
    const snippet = content.slice(start, end).replace(/\s+/g, ' ').trim()

    onActiveSnippetChange?.({
      docId: documentMeta?.id,
      keyword: searchQuery,
      locator: {
        type: 'text',
        keyword: searchQuery,
        startOffset: activeMatch.start,
        matchIndex: activeIndex,
      },
      snippet,
    })
  }, [activeIndex, content, documentMeta?.id, matches, onActiveSnippetChange, searchQuery])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin description="正在加载文本..." />
      </div>
    )
  }

  if (error) {
    return (
      <RequestErrorState
        title="文本预览加载失败"
        message={error}
        attempts={attempts}
      />
    )
  }

  if (!content) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty description={<span className="text-sm text-gray-500">文档内容为空</span>} />
      </div>
    )
  }

  const counterRef = { current: 0 }
  const markdownComponents = {
    p: ({ children, ...props }) => <p {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'p')}</p>,
    li: ({ children, ...props }) => <li {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'li')}</li>,
    td: ({ children, ...props }) => <td {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'td')}</td>,
    th: ({ children, ...props }) => <th {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'th')}</th>,
    h1: ({ children, ...props }) => <h1 {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'h1')}</h1>,
    h2: ({ children, ...props }) => <h2 {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'h2')}</h2>,
    h3: ({ children, ...props }) => <h3 {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'h3')}</h3>,
    h4: ({ children, ...props }) => <h4 {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'h4')}</h4>,
    h5: ({ children, ...props }) => <h5 {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'h5')}</h5>,
    h6: ({ children, ...props }) => <h6 {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'h6')}</h6>,
    blockquote: ({ children, ...props }) => <blockquote {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'quote')}</blockquote>,
    code: ({ children, ...props }) => <code {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'code')}</code>,
    strong: ({ children, ...props }) => <strong {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'strong')}</strong>,
    em: ({ children, ...props }) => <em {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'em')}</em>,
    a: ({ children, ...props }) => <a {...props}>{highlightReactNode(children, searchQuery, activeIndex, counterRef, 'a')}</a>,
  }

  const zoomStyle = buildViewerZoomStyle(zoomLevel)

  return (
    <div ref={containerRef} className="relative h-full min-h-0 overflow-auto bg-[#f7f8fb] p-4">
      <ViewerZoomControls
        zoomLevel={zoomLevel}
        onZoomChange={(updater) => {
          setZoomLevel((current) => {
            const next = typeof updater === 'function' ? updater(current) : updater
            return clampViewerZoomLevel(next)
          })
        }}
      />

      <div className="mx-auto min-h-full max-w-4xl rounded-lg border border-gray-200 bg-white px-8 py-6 shadow-sm" style={zoomStyle}>
        {isMarkdown ? (
          <div className="document-reader-markdown text-gray-800">
            <ReactMarkdown remarkPlugins={[remarkGfm, remarkBreaks]} components={markdownComponents}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          <pre className="m-0 whitespace-pre-wrap wrap-break-word font-mono text-[13px] leading-6 text-gray-800">
            {renderHighlightedText(content, searchQuery, activeIndex, counterRef, 'plain')}
          </pre>
        )}
      </div>
    </div>
  )
}
