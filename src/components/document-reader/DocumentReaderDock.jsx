import { useEffect, useMemo, useState } from 'react'
import { Button, Empty, Tag, Tooltip } from 'antd'
import {
  ArrowsAltOutlined,
  CloseOutlined,
  CompressOutlined,
  DownloadOutlined,
  ExclamationCircleOutlined,
  RightOutlined,
} from '@ant-design/icons'
import ProjectDocumentPanel from './ProjectDocumentPanel'
import DocumentViewerRouter from './DocumentViewerRouter'
import { fetchDocumentDownloadBlob, getDocumentFormatLabel } from '../../services/documentService'
import { useDocumentReader } from './DocumentReaderProvider'
import RequestErrorState from './RequestErrorState'

const EDGE_HOTZONE_WIDTH = 96

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
    documentNameMatches,
    searchResults,
    groupedSearchResults,
    searchLoading,
    searchError,
    searchAttemptCount,
    searchQuery,
    setSearchQuery,
    dockMode,
    isFullscreen,
    dockWidth,
    activeDocument,
    activeLocator,
    viewerMatchState,
    navRequest,
    setViewerMatchState,
    openDocument,
    openSearchResult,
    retryDocuments,
    retrySearch,
    close,
    toggleCollapsed,
    toggleFullscreen,
  } = useDocumentReader()

  const [edgeExpanded, setEdgeExpanded] = useState(false)
  const [downloadError, setDownloadError] = useState('')
  const [downloadAttempts, setDownloadAttempts] = useState(0)
  const showPeek = dockMode === 'peek'
  const showPanel = dockMode === 'open' || isFullscreen

  const shellStyle = useMemo(() => {
    if (isFullscreen) {
      return { top: 0, right: 0, bottom: 0, left: 0, width: 'auto' }
    }
    return { top: 0, right: 12, bottom: 0, width: dockWidth, minWidth: 520, maxWidth: 1100 }
  }, [dockWidth, isFullscreen])

  useEffect(() => {
    function handleMouseMove(event) {
      const edgeDistance = window.innerWidth - event.clientX
      setEdgeExpanded(edgeDistance <= EDGE_HOTZONE_WIDTH)
    }

    window.addEventListener('mousemove', handleMouseMove)
    return () => {
      window.removeEventListener('mousemove', handleMouseMove)
    }
  }, [])

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

  if (dockMode === 'closed' && !showPeek) return null

  return (
    <div className="document-reader-root">
      {showPeek && (
        <button
          type="button"
          onClick={toggleCollapsed}
          className={`document-reader-peek ${edgeExpanded ? 'document-reader-peek-proximity' : ''}`}
          title="展开文档阅读器"
        >
          <div className="document-reader-peek-badge">文档</div>
          <RightOutlined className="text-xs text-gray-300" />
        </button>
      )}

      {showPanel && (
        <section
          className="document-reader-shell"
          data-fullscreen={isFullscreen ? 'true' : 'false'}
          style={shellStyle}
        >
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
              {/* <p className="m-0 mt-1 text-xs text-gray-500">
                右侧浮动阅读，不挤压主画布
              </p> */}
            </div>

            <div className="flex items-center gap-1">
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

          <div className="grid min-h-0 flex-1 grid-cols-[280px_minmax(0,1fr)] overflow-hidden">
            <ProjectDocumentPanel
              documents={documents}
              documentsLoading={documentsLoading}
              documentsError={documentsError}
              documentsAttemptCount={documentsAttemptCount}
              documentNameMatches={documentNameMatches}
              searchResults={searchResults}
              groupedSearchResults={groupedSearchResults}
              searchLoading={searchLoading}
              searchError={searchError}
              searchAttemptCount={searchAttemptCount}
              searchQuery={searchQuery}
              activeDocument={activeDocument}
              activeDocumentId={activeDocument?.id || ''}
              onSearchChange={setSearchQuery}
              onOpenDocument={(doc) => openDocument(doc, null, { searchQuery })}
              onOpenSearchResult={openSearchResult}
              onRetryDocuments={retryDocuments}
              onRetrySearch={retrySearch}
            />

            <div className="min-w-0 bg-[#f8fbff]">
              <DocumentViewerRouter
                documentMeta={activeDocument}
                searchQuery={searchQuery}
                locator={activeLocator}
                activeLocator={activeLocator}
                navRequest={navRequest}
                matchState={viewerMatchState}
                onMatchStateChange={setViewerMatchState}
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
