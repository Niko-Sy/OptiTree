import { useEffect, useMemo, useRef, useState } from 'react'
import { Spin } from 'antd'
import { SpecialZoomLevel, Viewer, Worker } from '@react-pdf-viewer/core'
import { searchPlugin } from '@react-pdf-viewer/search'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.js?url'
import '@react-pdf-viewer/core/lib/styles/index.css'
import '@react-pdf-viewer/search/lib/styles/index.css'
import { fetchDocumentPreviewBlob } from '../../../services/documentService'
import RequestErrorState from '../RequestErrorState'

function findGlobalIndex(matches, candidate) {
  if (!candidate) return -1
  return matches.findIndex((item) => item.pageIndex === candidate.pageIndex && item.matchIndex === candidate.matchIndex)
}

export default function PdfReader({
  documentMeta,
  searchQuery,
  locator,
  navRequest,
  onMatchStateChange,
}) {
  const searchPluginInstance = useMemo(() => searchPlugin({ enableShortcuts: false }), [])
  const [fileUrl, setFileUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [activeIndex, setActiveIndex] = useState(-1)
  const matchesRef = useRef([])

  useEffect(() => {
    let cancelled = false
    let objectUrl = ''

    async function loadFile() {
      setLoading(true)
      setError('')
      setAttempts(0)
      setActiveIndex(-1)
      matchesRef.current = []
      onMatchStateChange?.({ count: 0, activeIndex: -1 })

      try {
        const blob = await fetchDocumentPreviewBlob(documentMeta, {
          onAttempt: (attempt) => {
            if (!cancelled) setAttempts(attempt)
          },
        })
        objectUrl = URL.createObjectURL(blob)
        if (!cancelled) setFileUrl(objectUrl)
      } catch (err) {
        if (!cancelled) {
          const msg = err?.message || 'PDF 预览加载失败'
          setError(msg)
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadFile()

    return () => {
      cancelled = true
      if (objectUrl) URL.revokeObjectURL(objectUrl)
    }
  }, [documentMeta, onMatchStateChange])

  useEffect(() => {
    let cancelled = false

    async function runSearch() {
      if (!fileUrl) return
      const keyword = String(searchQuery || '').trim()
      if (!keyword) {
        searchPluginInstance.clearHighlights()
        matchesRef.current = []
        setActiveIndex(-1)
        onMatchStateChange?.({ count: 0, activeIndex: -1 })
        return
      }

      const matches = await searchPluginInstance.highlight(keyword)
      if (cancelled) return

      matchesRef.current = matches
      if (!matches.length) {
        setActiveIndex(-1)
        onMatchStateChange?.({ count: 0, activeIndex: -1 })
        return
      }

      let nextIndex = 0
      if (Number.isFinite(locator?.matchIndex)) {
        nextIndex = Math.max(0, Math.min(matches.length - 1, locator.matchIndex))
      } else if (Number.isFinite(locator?.page)) {
        const matchedIndex = matches.findIndex((item) => item.pageIndex === Number(locator.page) - 1)
        nextIndex = matchedIndex >= 0 ? matchedIndex : 0
      }

      searchPluginInstance.jumpToMatch(nextIndex + 1)
      setActiveIndex(nextIndex)
      onMatchStateChange?.({ count: matches.length, activeIndex: nextIndex })
    }

    runSearch().catch((err) => {
      const msg = err?.message || 'PDF 搜索失败'
      setError(msg)
    })

    return () => {
      cancelled = true
    }
  }, [fileUrl, locator?.matchIndex, locator?.page, onMatchStateChange, searchPluginInstance, searchQuery])

  useEffect(() => {
    if (!navRequest || !matchesRef.current.length) return

    const nextActiveIndex = navRequest.direction === 'prev'
      ? (activeIndex <= 0 ? matchesRef.current.length - 1 : activeIndex - 1)
      : (activeIndex >= matchesRef.current.length - 1 ? 0 : activeIndex + 1)

    const candidate = navRequest.direction === 'prev'
      ? searchPluginInstance.jumpToPreviousMatch()
      : searchPluginInstance.jumpToNextMatch()

    const resolvedIndex = findGlobalIndex(matchesRef.current, candidate)
    const targetIndex = resolvedIndex >= 0 ? resolvedIndex : nextActiveIndex
    setActiveIndex(targetIndex)
    onMatchStateChange?.({ count: matchesRef.current.length, activeIndex: targetIndex })
  }, [activeIndex, navRequest, onMatchStateChange, searchPluginInstance])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin tip="正在加载 PDF..." />
      </div>
    )
  }

  if (error) {
    return (
      <RequestErrorState
        title="PDF 预览加载失败"
        message={error}
        attempts={attempts}
      />
    )
  }

  if (!fileUrl) return null

  return (
    <div className="h-full min-h-0 bg-[#f7f8fb] p-4">
      <div className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm">
        <Worker workerUrl={workerUrl}>
          <Viewer
            key={`${documentMeta.id}-${locator?.page || 0}`}
            fileUrl={fileUrl}
            plugins={[searchPluginInstance]}
            defaultScale={SpecialZoomLevel.PageFit}
            initialPage={Number.isFinite(locator?.page) ? Math.max(0, Number(locator.page) - 1) : 0}
            renderLoader={(percentages) => (
              <div className="flex h-full items-center justify-center text-sm text-gray-500">
                正在渲染 PDF... {Math.round(percentages)}%
              </div>
            )}
          />
        </Worker>
      </div>
    </div>
  )
}
