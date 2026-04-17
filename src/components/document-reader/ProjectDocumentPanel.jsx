import { Empty, Input, Spin, Tag, Tooltip } from 'antd'
import { FileTextOutlined, SearchOutlined } from '@ant-design/icons'
import { getDocumentFormatLabel } from '../../services/documentService'
import { renderHighlightedText } from './highlightUtils'
import RequestErrorState from './RequestErrorState'

function PreviewStatusTag({ status }) {
  if (status === 'processing') return <Tag color="processing" className="m-0">转换中</Tag>
  if (status === 'failed') return <Tag color="error" className="m-0">预览失败</Tag>
  return <Tag color="success" className="m-0">可预览</Tag>
}

function SearchSection({
  section,
  searchQuery,
  onOpenDocument,
  onOpenSearchResult,
}) {
  const counterRefFactory = () => ({ current: 0 })
  const isCurrentSection = section.key === 'current-document'
  const isDocumentNameSection = section.key === 'document-name'

  return (
    <div className={`document-reader-search-section ${section.emphasized ? 'document-reader-search-section-priority' : ''}`}>
      <div className="mb-2 flex items-center justify-between gap-2 px-1">
        <p className={`m-0 text-[11px] font-semibold uppercase tracking-wide ${
          section.emphasized ? 'text-emerald-600' : 'text-gray-500'
        }`}
        >
          {section.title}
        </p>
        <Tag color={section.tone} className="m-0">{section.count}</Tag>
      </div>

      {section.hint && (
        <p className="mb-2 rounded-lg border border-emerald-100 bg-emerald-50 px-2 py-1 text-[11px] leading-5 text-emerald-700">
          {section.hint}
        </p>
      )}

      {section.items.length === 0 && (
        <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-3 text-center text-xs text-gray-500">
          {section.emptyMessage}
        </div>
      )}

      {section.items.length > 0 && (
        <div className="space-y-2">
          {section.items.map((item) => {
            if (isDocumentNameSection) {
              const doc = item.doc
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => onOpenDocument?.(doc)}
                  className="w-full rounded-xl border border-gray-200 bg-white px-3 py-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50/50"
                >
                  <div className="min-w-0">
                    <p className="m-0 truncate text-sm font-medium text-gray-800">
                      {renderHighlightedText(doc.name || '', searchQuery, -1, counterRefFactory(), item.id)}
                    </p>
                    <p className="m-0 mt-1 text-xs text-gray-500">点击打开文档</p>
                  </div>
                </button>
              )
            }

            const result = item
            return (
              <button
                key={`${section.key}-${result.id}`}
                type="button"
                onClick={() => onOpenSearchResult?.(result)}
                className={`w-full rounded-xl border px-3 py-3 text-left transition-all hover:border-blue-200 hover:bg-blue-50/50 ${
                  isCurrentSection
                    ? 'border-emerald-200 bg-emerald-50/70'
                    : 'border-gray-200 bg-white'
                }`}
              >
                <div className="min-w-0">
                  {!isCurrentSection && (
                    <Tooltip title={result.docName}>
                      <p className="m-0 truncate text-sm font-medium text-gray-800">
                        {renderHighlightedText(result.docName || '', searchQuery, -1, counterRefFactory(), `doc-${result.id}`)}
                      </p>
                    </Tooltip>
                  )}
                  <p className="m-0 mt-1 line-clamp-3 text-xs leading-5 text-gray-500">
                    {renderHighlightedText(
                      result.snippet || '打开后将定位到对应命中位置',
                      searchQuery,
                      -1,
                      counterRefFactory(),
                      `${section.key}-${result.id}`,
                    )}
                  </p>
                </div>
              </button>
            )
          })}
        </div>
      )}
    </div>
  )
}

export default function ProjectDocumentPanel({
  collapsed,
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
  activeDocument,
  activeDocumentId,
  onSearchChange,
  onOpenDocument,
  onOpenSearchResult,
  onRetryDocuments,
  onRetrySearch,
}) {
  const trimmedQuery = String(searchQuery || '').trim()
  const hasQuery = Boolean(trimmedQuery)
  const primarySectionCount = prioritizedSearchSections?.[0]?.count || 0

  return (
    <div className="flex h-full min-h-0 flex-col border-r border-gray-200 bg-[#f7fbff]">
      <div className="border-b border-gray-200 px-4 py-4">
        <div className="mb-3 flex items-center justify-between gap-2">
          <div>
            <p className="m-0 text-sm font-semibold text-gray-800">项目文档</p>
            <p className="m-0 mt-1 text-xs text-gray-500">打开、搜索并定位到文档内容</p>
          </div>
          <Tag color="blue" className="m-0">{documents.length}</Tag>
        </div>
        <Input
          allowClear
          disabled={collapsed}
          value={searchQuery}
          onChange={(event) => onSearchChange?.(event.target.value)}
          placeholder="全局搜索：文档名 + 文档内容"
          prefix={<SearchOutlined className="text-gray-500" />}
          className="document-reader-search-input"
        />
      </div>

      <div className="flex-1 overflow-y-auto px-3 py-3">
        <div className="mb-4">
          <p className="mb-2 px-1 text-[11px] font-semibold uppercase tracking-wide text-gray-500">文档列表</p>
          {documentsLoading && (
            <div className="flex items-center justify-center py-8">
              <Spin size="small" />
            </div>
          )}
          {!documentsLoading && documentsError && (
            <RequestErrorState
              compact
              title="文档列表加载失败"
              message={documentsError}
              attempts={documentsAttemptCount}
              retryLabel="重新加载"
              onRetry={onRetryDocuments}
            />
          )}
          {!documentsLoading && !documentsError && documents.length === 0 && (
            <Empty
              image={Empty.PRESENTED_IMAGE_SIMPLE}
              description={<span className="text-xs text-gray-500">项目中暂无可用文档</span>}
            />
          )}
          {!documentsLoading && documents.length > 0 && (
            <div className="space-y-2">
              {documents.map((doc) => {
                const isActive = doc.id === activeDocumentId
                return (
                  <button
                    key={doc.id}
                    type="button"
                    onClick={() => onOpenDocument?.(doc)}
                    className={`w-full rounded-xl border px-3 py-3 text-left transition-all ${
                      isActive
                        ? 'border-blue-500 bg-blue-50 shadow-[0_0_0_1px_rgba(59,130,246,0.22)]'
                        : 'border-gray-200 bg-white hover:border-blue-200 hover:bg-blue-50/50'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="m-0 truncate text-sm font-medium text-gray-800">{doc.name}</p>
                        <div className="mt-1 flex items-center gap-2 text-[11px] text-gray-500">
                          <FileTextOutlined />
                          <span>{getDocumentFormatLabel(doc)}</span>
                        </div>
                      </div>
                      <PreviewStatusTag status={doc.previewStatus} />
                    </div>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="border-t border-gray-200 pt-3">
          <div className="mb-2 flex items-center justify-between gap-2 px-1">
            <p className="m-0 text-[11px] font-semibold uppercase tracking-wide text-gray-500">全局搜索</p>
            {trimmedQuery && (
              <div className="flex items-center gap-2">
                <Tag color="green" className="m-0">当前 {primarySectionCount}</Tag>
                <Tag color="blue" className="m-0">总计 {searchResultTotalCount}</Tag>
              </div>
            )}
          </div>

          {!hasQuery && (
            <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-5 text-center text-xs text-gray-500">
              输入关键词后，这里会优先展示当前文档命中，再展示全局文档结果
            </div>
          )}

          {hasQuery && searchLoading && (
            <div className="flex items-center justify-center py-6">
              <Spin size="small" />
            </div>
          )}

          {hasQuery && !searchLoading && searchError && (
            <RequestErrorState
              compact
              title="全局搜索失败"
              message={searchError}
              attempts={searchAttemptCount}
              retryLabel="重新搜索"
              onRetry={onRetrySearch}
            />
          )}

          {hasQuery && !searchLoading && !searchError && (
            <div className="space-y-3">
              {prioritizedSearchSections.map((section) => (
                <SearchSection
                  key={section.key}
                  section={section}
                  searchQuery={searchQuery}
                  onOpenDocument={onOpenDocument}
                  onOpenSearchResult={onOpenSearchResult}
                />
              ))}

              {searchResultTotalCount === 0 && (
                <div className="rounded-xl border border-dashed border-gray-200 bg-white px-3 py-3 text-center text-xs text-gray-500">
                  {activeDocument ? '没有找到与当前搜索相关的结果' : '没有找到相关结果'}
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
