import { useEffect, useMemo, useRef, useState } from 'react'
import { Empty, Spin, Table, Tabs } from 'antd'
import * as XLSX from 'xlsx'
import { fetchDocumentPreviewBlob } from '../../../services/documentService'
import { findTextMatches } from '../highlightUtils'
import RequestErrorState from '../RequestErrorState'
import ViewerZoomControls, { buildViewerZoomStyle, clampViewerZoomLevel } from '../ViewerZoomControls'

const PAGE_SIZE = 50

function toColumnLabel(index) {
  let value = index
  let label = ''
  while (value >= 0) {
    label = String.fromCharCode((value % 26) + 65) + label
    value = Math.floor(value / 26) - 1
  }
  return label
}

function renderCellText(text, matches, activeIndex) {
  const source = String(text ?? '')
  if (!matches.length) return source

  const nodes = []
  let cursor = 0
  matches.forEach((match, idx) => {
    if (match.start > cursor) nodes.push(source.slice(cursor, match.start))
    nodes.push(
      <mark
        key={`${match.index}-${idx}`}
        data-match-index={match.index}
        className={match.index === activeIndex ? 'document-reader-mark document-reader-mark-active' : 'document-reader-mark'}
      >
        {source.slice(match.start, match.end)}
      </mark>,
    )
    cursor = match.end
  })
  if (cursor < source.length) nodes.push(source.slice(cursor))
  return nodes
}

export default function TabularReader({
  documentMeta,
  searchQuery,
  locator,
  navRequest,
  onMatchStateChange,
  onActiveSnippetChange,
}) {
  const rootRef = useRef(null)
  const [workbook, setWorkbook] = useState([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [attempts, setAttempts] = useState(0)
  const [activeSheet, setActiveSheet] = useState('')
  const [activeIndex, setActiveIndex] = useState(-1)
  const [pageBySheet, setPageBySheet] = useState({})
  const [zoomLevel, setZoomLevel] = useState(1)

  useEffect(() => {
    let cancelled = false

    async function loadWorkbook() {
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
        const buffer = await blob.arrayBuffer()
        const parsed = XLSX.read(buffer, { type: 'array' })
        const sheets = parsed.SheetNames.map((sheetName) => {
          const rows = XLSX.utils.sheet_to_json(parsed.Sheets[sheetName], {
            header: 1,
            raw: false,
            defval: '',
            blankrows: true,
          })
          const maxCols = Math.max(1, ...rows.map((row) => (Array.isArray(row) ? row.length : 0)))
          return { sheetName, rows, maxCols }
        })

        if (!cancelled) {
          setWorkbook(sheets)
          setActiveSheet(sheets[0]?.sheetName || '')
          setPageBySheet({})
        }
      } catch (err) {
        if (!cancelled) setError(err?.message || '表格预览加载失败')
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadWorkbook()

    return () => {
      cancelled = true
    }
  }, [documentMeta, onMatchStateChange])

  const matches = useMemo(() => {
    const keyword = String(searchQuery || '').trim()
    if (!keyword) return []

    let globalIndex = 0
    const nextMatches = []
    workbook.forEach((sheet) => {
      sheet.rows.forEach((row, rowIndex) => {
        Array.from({ length: sheet.maxCols }).forEach((_, colIndex) => {
          const value = String((row || [])[colIndex] ?? '')
          const cellMatches = findTextMatches(value, keyword)
          cellMatches.forEach((item) => {
            nextMatches.push({
              index: globalIndex,
              sheetName: sheet.sheetName,
              rowIndex,
              colIndex,
              start: item.start,
              end: item.end,
            })
            globalIndex += 1
          })
        })
      })
    })
    return nextMatches
  }, [searchQuery, workbook])

  const cellMatchMap = useMemo(() => {
    const map = new Map()
    matches.forEach((match) => {
      const key = `${match.sheetName}::${match.rowIndex}::${match.colIndex}`
      const list = map.get(key) || []
      list.push(match)
      map.set(key, list)
    })
    return map
  }, [matches])

  useEffect(() => {
    if (!matches.length) {
      setActiveIndex(-1)
      onMatchStateChange?.({ count: 0, activeIndex: -1 })
      return
    }

    let nextIndex = 0
    if (locator?.sheetName && Number.isFinite(locator?.rowIndex) && Number.isFinite(locator?.colIndex)) {
      const locatedIndex = matches.findIndex((item) => (
        item.sheetName === locator.sheetName
        && item.rowIndex === locator.rowIndex
        && item.colIndex === locator.colIndex
      ))
      nextIndex = locatedIndex >= 0 ? locatedIndex : 0
    }

    setActiveIndex(nextIndex)
    onMatchStateChange?.({ count: matches.length, activeIndex: nextIndex })
  }, [locator?.colIndex, locator?.rowIndex, locator?.sheetName, matches, onMatchStateChange])

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

  const activeMatch = activeIndex >= 0 ? matches[activeIndex] : null

  useEffect(() => {
    if (!activeMatch) return
    setActiveSheet(activeMatch.sheetName)
    setPageBySheet((prev) => ({
      ...prev,
      [activeMatch.sheetName]: Math.floor(activeMatch.rowIndex / PAGE_SIZE) + 1,
    }))

    const timer = window.setTimeout(() => {
      const selector = `[data-tabular-cell="${activeMatch.sheetName}::${activeMatch.rowIndex}::${activeMatch.colIndex}"]`
      rootRef.current?.querySelector(selector)?.scrollIntoView({ block: 'center', inline: 'center', behavior: 'smooth' })
    }, 60)
    return () => window.clearTimeout(timer)
  }, [activeMatch])

  useEffect(() => {
    if (!activeMatch) return

    const sheet = workbook.find((item) => item.sheetName === activeMatch.sheetName)
    const row = sheet?.rows?.[activeMatch.rowIndex]
    const value = String((row || [])[activeMatch.colIndex] ?? '')
    const snippet = value.replace(/\s+/g, ' ').trim().slice(0, 240)

    onActiveSnippetChange?.({
      docId: documentMeta?.id,
      keyword: searchQuery,
      locator: {
        type: 'tabular',
        keyword: searchQuery,
        sheetName: activeMatch.sheetName,
        rowIndex: activeMatch.rowIndex,
        colIndex: activeMatch.colIndex,
        matchIndex: activeIndex,
      },
      snippet,
    })
  }, [activeIndex, activeMatch, documentMeta?.id, onActiveSnippetChange, searchQuery, workbook])

  const currentSheet = workbook.find((sheet) => sheet.sheetName === activeSheet) || workbook[0]
  const currentPage = pageBySheet[currentSheet?.sheetName] || 1

  const tableColumns = useMemo(() => {
    if (!currentSheet) return []

    return [
      { title: '#', dataIndex: '__row', key: '__row', width: 64, fixed: 'left' },
      ...Array.from({ length: currentSheet.maxCols }).map((_, colIndex) => ({
        title: toColumnLabel(colIndex),
        dataIndex: `c${colIndex}`,
        key: `c${colIndex}`,
        width: 160,
        render: (value, record) => {
          const cellKey = `${currentSheet.sheetName}::${record.__rowIndex}::${colIndex}`
          const cellMatches = cellMatchMap.get(cellKey) || []
          const isActive = Boolean(activeMatch)
            && activeMatch.sheetName === currentSheet.sheetName
            && activeMatch.rowIndex === record.__rowIndex
            && activeMatch.colIndex === colIndex

          return (
            <div
              data-tabular-cell={cellKey}
              className={isActive ? 'rounded-md bg-blue-50 px-1.5 py-0.5 ring-1 ring-blue-200' : 'px-1.5 py-0.5'}
            >
              {renderCellText(value, cellMatches, activeIndex)}
            </div>
          )
        },
      })),
    ]
  }, [activeIndex, activeMatch, cellMatchMap, currentSheet])

  const tableData = useMemo(() => {
    if (!currentSheet) return []
    return currentSheet.rows.map((row, rowIndex) => {
      const item = {
        key: `${currentSheet.sheetName}-${rowIndex}`,
        __row: rowIndex + 1,
        __rowIndex: rowIndex,
      }
      Array.from({ length: currentSheet.maxCols }).forEach((_, colIndex) => {
        item[`c${colIndex}`] = String((row || [])[colIndex] ?? '')
      })
      return item
    })
  }, [currentSheet])

  if (loading) {
    return (
      <div className="flex h-full items-center justify-center">
        <Spin description="正在解析表格..." />
      </div>
    )
  }

  if (error) {
    return (
      <RequestErrorState
        title="表格预览加载失败"
        message={error}
        attempts={attempts}
      />
    )
  }

  if (!currentSheet) {
    return (
      <div className="flex h-full items-center justify-center">
        <Empty description={<span className="text-sm text-gray-500">该表格没有可显示的数据</span>} />
      </div>
    )
  }

  const zoomStyle = buildViewerZoomStyle(zoomLevel)

  return (
    <div ref={rootRef} className="relative flex h-full min-h-0 flex-col">
      <ViewerZoomControls
        zoomLevel={zoomLevel}
        onZoomChange={(updater) => {
          setZoomLevel((current) => {
            const next = typeof updater === 'function' ? updater(current) : updater
            return clampViewerZoomLevel(next)
          })
        }}
      />

      <div className="border-b border-gray-200 bg-white px-4 py-2" style={zoomStyle}>
        <Tabs
          size="small"
          activeKey={activeSheet}
          onChange={setActiveSheet}
          items={workbook.map((sheet) => ({ key: sheet.sheetName, label: sheet.sheetName }))}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-hidden p-4" style={zoomStyle}>
        <div className="h-full overflow-hidden rounded-lg border border-gray-200 bg-white">
          <Table
            size="small"
            columns={tableColumns}
            dataSource={tableData}
            pagination={{
              current: currentPage,
              pageSize: PAGE_SIZE,
              total: tableData.length,
              onChange: (page) => setPageBySheet((prev) => ({ ...prev, [currentSheet.sheetName]: page })),
              showSizeChanger: false,
            }}
            scroll={{ x: 'max-content', y: 'calc(100vh - 280px)' }}
            rowClassName={(record) => (
              activeMatch && activeMatch.sheetName === currentSheet.sheetName && activeMatch.rowIndex === record.__rowIndex
                ? 'bg-blue-50/60'
                : ''
            )}
          />
        </div>
      </div>
    </div>
  )
}
