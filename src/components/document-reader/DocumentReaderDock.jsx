import { useEffect, useMemo, useRef, useState } from 'react'
import { Button, Empty, Tag, Tooltip } from 'antd'
import {
  ArrowsAltOutlined,
  CloseOutlined,
  CompressOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  SearchOutlined,
} from '@ant-design/icons'
import ProjectDocumentPanel from './ProjectDocumentPanel'
import DocumentViewerRouter from './DocumentViewerRouter'
import { fetchDocumentDownloadBlob, getDocumentFormatLabel } from '../../services/documentService'
import { useDocumentReader } from './DocumentReaderProvider'
import RequestErrorState from './RequestErrorState'

const HALF_SCREEN_INSET = 12
const PEEK_DRAG_THRESHOLD = 4

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.download = filename || 'document'
  link.click()
  URL.revokeObjectURL(url)
}

export default function DocumentReaderDock() {
  const {
    documents,
    documentsLoading,
    documentsError,
    documentsAttemptCount,
    prioritizedSearchSections,
    searchLoading,
    searchError,
    searchAttemptCount,
    searchQuery,
    searchResultTotalCount,
    setSearchQuery,
    dockMode,
    isFullscreen,
    dockWidth,
    setDockWidth,
    peekTop,
    setPeekTop,
    sidebarWidth,
    sidebarCollapsed,
    toggleSidebar,
    reportShellMetrics,
    activeDocument,
    activeLocator,
    viewerMatchState,
    navRequest,
    setViewerMatchState,
    openDocument,
    openSearchResult,
    resolveSearchSnippet,
    retryDocuments,
    retrySearch,
    close,
    toggleCollapsed,
    toggleFullscreen,
  } = useDocumentReader()

  const shellRef = useRef(null)
  const suppressPeekClickRef = useRef(false)
  const peekDragRef = useRef(null)
  const resizeDragRef = useRef(null)

  const [peekExpanded, setPeekExpanded] = useState(false)
  const [peekDragging, setPeekDragging] = useState(false)
  const [resizing, setResizing] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [downloadAttempts, setDownloadAttempts] = useState(0)

  const showPeek = dockMode === 'peek'
  const showPanel = dockMode === 'open' || isFullscreen
  const showSidebar = sidebarWidth > 0

  const shellStyle = useMemo(() => {
    if (isFullscreen) {
      return { top: 0, right: 0, bottom: 0, left: 0, width: 'auto' }
    }
    return {
      top: HALF_SCREEN_INSET,
      right: HALF_SCREEN_INSET,
      bottom: HALF_SCREEN_INSET,
      width: dockWidth,
      minWidth: 520,
      maxWidth: 1100,
    }
  }, [dockWidth, isFullscreen])

  useEffect(() => {
    if (!showPanel || !shellRef.current) {
      reportShellMetrics({ width: 0, height: 0 })
      return undefined
    }

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]
      if (!entry) return
      reportShellMetrics({
        width: entry.contentRect.width,
        height: entry.contentRect.height,
      })
    })

    observer.observe(shellRef.current)
    return () => {
      observer.disconnect()
      reportShellMetrics({ width: 0, height: 0 })
    }
  }, [reportShellMetrics, showPanel])

  async function handleDownload() {
    if (!activeDocument) return
    setDownloadError('')
    setDownloadAttempts(0)
    try {
      const blob = await fetchDocumentDownloadBlob(activeDocument, {
        onAttempt: (attempt) => {
          setDownloadAttempts(attempt)
        },
      })
      triggerBrowserDownload(blob, activeDocument.name)
    } catch (error) {
      setDownloadError(error?.message || '文档下载失败')
    }
  }

  function handlePeekPointerDown(event) {
    if (event.button !== 0) return
    peekDragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startTop: peekTop,
      moved: false,
    }
    setPeekExpanded(true)
    setPeekDragging(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handlePeekPointerMove(event) {
    const dragState = peekDragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return

    const deltaY = event.clientY - dragState.startY
    if (!dragState.moved && Math.abs(deltaY) >= PEEK_DRAG_THRESHOLD) {
      dragState.moved = true
    }
    if (dragState.moved) {
      setPeekTop(dragState.startTop + deltaY)
    }
  }

  function finishPeekDrag(event) {
    const dragState = peekDragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const moved = dragState.moved
    peekDragRef.current = null
    setPeekDragging(false)
    if (moved) {
      suppressPeekClickRef.current = true
    }
    if (!peekExpanded) {
      setPeekExpanded(false)
    }
    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  function handlePeekClick(event) {
    if (suppressPeekClickRef.current) {
      suppressPeekClickRef.current = false
      event.preventDefault()
      return
    }
    toggleCollapsed()
  }

  function handleResizePointerDown(event) {
    if (isFullscreen || event.button !== 0) return
    resizeDragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startWidth: dockWidth,
    }
    setResizing(true)
    event.currentTarget.setPointerCapture(event.pointerId)
  }

  function handleResizePointerMove(event) {
    const dragState = resizeDragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    const deltaX = event.clientX - dragState.startX
    setDockWidth(dragState.startWidth - deltaX)
  }

  function finishResize(event) {
    const dragState = resizeDragRef.current
    if (!dragState || dragState.pointerId !== event.pointerId) return
    resizeDragRef.current = null
    setResizing(false)
    if (event.currentTarget?.hasPointerCapture?.(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId)
    }
  }

  if (dockMode === 'closed' && !showPeek) return null

  return (
    <div className="document-reader-root">
      {showPeek && (
        <div
          className="document-reader-peek-hotzone"
          style={{ top: peekTop }}
          onMouseEnter={() => setPeekExpanded(true)}
          onMouseLeave={() => !peekDragging && setPeekExpanded(false)}
        >
          <button
            type="button"
            onClick={handlePeekClick}
            onPointerDown={handlePeekPointerDown}
            onPointerMove={handlePeekPointerMove}
            onPointerUp={finishPeekDrag}
            onPointerCancel={finishPeekDrag}
            onFocus={() => setPeekExpanded(true)}
            onBlur={() => !peekDragging && setPeekExpanded(false)}
            className={`document-reader-peek ${peekExpanded || peekDragging ? 'document-reader-peek-expanded' : ''}`}
            title="展开文档阅读器"
          >
            {/* <div className="document-reader-peek-content">
              <div className="document-reader-peek-badge">文档</div>
            </div> */}
          </button>
        </div>
      )}

      {showPanel && (
        <section
          ref={shellRef}
          className={`document-reader-shell ${resizing ? 'document-reader-shell-resizing' : ''}`}
          data-fullscreen={isFullscreen ? 'true' : 'false'}
          style={shellStyle}
        >
          {!isFullscreen && (
            <div
              className="document-reader-shell-resize-handle"
              onPointerDown={handleResizePointerDown}
              onPointerMove={handleResizePointerMove}
              onPointerUp={finishResize}
              onPointerCancel={finishResize}
            />
          )}

          <header className="document-reader-shell-header">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <h3 className="m-0 truncate text-lg font-semibold text-gray-800">
                  {activeDocument?.name || '文档阅读器'}
                </h3>
                {activeDocument && (
                  <Tag color="blue" className="m-0 shrink-0">
                    {getDocumentFormatLabel(activeDocument)}
                  </Tag>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1">
              <Tooltip title={sidebarCollapsed ? '展开项目文档与搜索' : '收起项目文档与搜索'}>
                <Button
                  type="text"
                  size="small"
                  icon={<SearchOutlined />}
                  className={sidebarCollapsed ? 'text-blue-600' : 'text-gray-500'}
                  onClick={toggleSidebar}
                />
              </Tooltip>
              {downloadError && (
                <Tooltip title={`下载失败：${downloadError}`}>
                  <ExclamationCircleOutlined className="text-sm text-amber-500" />
                </Tooltip>
              )}
              <Tooltip title="下载原文件">
                <Button
                  type="text"
                  size="small"
                  icon={<DownloadOutlined />}
                  className="text-gray-500"
                  onClick={handleDownload}
                  disabled={!activeDocument}
                />
              </Tooltip>
              <Tooltip title={isFullscreen ? '退出全屏' : '全屏'}>
                <Button
                  type="text"
                  size="small"
                  icon={isFullscreen ? <CompressOutlined /> : <ArrowsAltOutlined />}
                  className="text-gray-500"
                  onClick={toggleFullscreen}
                />
              </Tooltip>
              <Tooltip title="收起到边缘气泡">
                <Button
                  type="text"
                  size="small"
                  icon={<CloseOutlined />}
                  className="text-gray-500"
                  onClick={close}
                />
              </Tooltip>
            </div>
          </header>

          {downloadError && (
            <div className="border-b border-gray-200 bg-white px-4 py-3">
              <RequestErrorState
                compact
                title="文档下载失败"
                message={downloadError}
                attempts={downloadAttempts}
                retryLabel="重试下载"
                onRetry={handleDownload}
              />
            </div>
          )}

          <div className="document-reader-shell-body">
            <div
              className={`document-reader-sidebar-frame ${showSidebar ? 'document-reader-sidebar-frame-open' : 'document-reader-sidebar-frame-collapsed'}`}
              style={{ width: sidebarWidth }}
              aria-hidden={sidebarCollapsed ? 'true' : 'false'}
            >
              <ProjectDocumentPanel
                collapsed={sidebarCollapsed}
                documents={documents}
                documentsLoading={documentsLoading}
                documentsError={documentsError}
                documentsAttemptCount={documentsAttemptCount}
                prioritizedSearchSections={prioritizedSearchSections}
                searchLoading={searchLoading}
                searchError={searchError}
                searchAttemptCount={searchAttemptCount}
                searchQuery={searchQuery}
                searchResultTotalCount={searchResultTotalCount}
                activeDocument={activeDocument}
                activeDocumentId={activeDocument?.id || ''}
                onSearchChange={setSearchQuery}
                onOpenDocument={(doc) => openDocument(doc, null, { searchQuery, revealSidebar: true })}
                onOpenSearchResult={openSearchResult}
                onRetryDocuments={retryDocuments}
                onRetrySearch={retrySearch}
              />
            </div>

            <div className="min-w-0 flex-1 bg-[#f8fbff]">
              <DocumentViewerRouter
                documentMeta={activeDocument}
                searchQuery={searchQuery}
                locator={activeLocator}
                activeLocator={activeLocator}
                navRequest={navRequest}
                matchState={viewerMatchState}
                onMatchStateChange={setViewerMatchState}
                onResolveActiveSnippet={resolveSearchSnippet}
              />
              {!activeDocument && (
                <div className="hidden h-full items-center justify-center md:flex">
                  <Empty
                    image={Empty.PRESENTED_IMAGE_SIMPLE}
                    description={<span className="text-sm text-gray-500">选择文档后会在这里打开</span>}
                  />
                </div>
              )}
            </div>
          </div>
        </section>
      )}
    </div>
  )
}
