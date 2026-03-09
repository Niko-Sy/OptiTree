// 编辑器顶部工具栏组件，包含项目名称、导入/导出、撤销/重做、自动排版、AI 校验等功能按钮
import { useRef, useState } from 'react'
import { Button, Tooltip, message, Tag, Dropdown } from 'antd'
import {
  UndoOutlined, RedoOutlined, DownloadOutlined, UploadOutlined,
  ApartmentOutlined, RobotOutlined, ArrowLeftOutlined, SaveOutlined,
  TeamOutlined, FileImageOutlined, FileSyncOutlined,
  DownOutlined, ThunderboltOutlined,CheckOutlined
} from '@ant-design/icons'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { saveVersion } from '../../services/aiService'
import UserAvatar from '../common/UserAvatar'
import { useEditorStore, useEditorActions } from '../../store/useEditorStore'
import {
  computeLayout,
  computeHorizontalLayout,
  computeGridLayout,
  computeForceLayout,
  selectAnchorsByLayout,
} from '../../utils/layoutAlgorithm'
import { validateFaultTree } from '../../utils/aiValidator'
import { buildFaultTreeSVG, downloadSvg, downloadSvgAsPng } from '../../utils/exportUtils'
import DocumentUploadModal from '../dashboard/DocumentUploadModal'

const DEMO_JSON = {
  rootId: 'root',
  nodes: [
    { id: 'root',   type: 'topEvent',   name: '系统启动失败' },
    { id: 'mid1',   type: 'midEvent',   name: '电源故障' },
    { id: 'mid2',   type: 'midEvent',   name: '软件错误' },
    { id: 'gate1',  type: 'gate',       name: 'OR' },
    { id: 'gate2',  type: 'gate',       name: 'AND' },
    { id: 'basic1', type: 'basicEvent', name: '电池没电' },
    { id: 'basic2', type: 'basicEvent', name: '线路短路' },
    { id: 'basic3', type: 'basicEvent', name: '引导文件损坏' },
  ],
  edges: [
    { id: 'e1', from: 'root',  to: 'gate1' },
    { id: 'e2', from: 'gate1', to: 'mid1' },
    { id: 'e3', from: 'gate1', to: 'mid2' },
    { id: 'e4', from: 'mid1',  to: 'gate2' },
    { id: 'e5', from: 'gate2', to: 'basic1' },
    { id: 'e6', from: 'gate2', to: 'basic2' },
    { id: 'e7', from: 'mid2',  to: 'basic3' },
  ],
}

// ── External format converter ────────────────────────────────────
// Supports the nodeList/linkList format used by the platform FTA tool.
//
// External node types:  "1" = topEvent, "2" = midEvent, "3" = basicEvent
// External gate types:  "1" = AND,      "2" = OR,       "3" = NOT
// linkList direction:   sourceId (child) → targetId (parent)  [REVERSED vs our from/to]
//
// Each node's `event` sub-object carries:
//   id, name, description, errorLevel, priority,
//   probability, showProbability, rules, investigateMethod, documents
//
function parseExternalFormat(json) {
  const TYPE_MAP = { '1': 'topEvent', '2': 'midEvent', '3': 'basicEvent' }
  const GATE_MAP = { '1': 'AND', '2': 'OR', '3': 'NOT' }

  const nodes = json.nodeList.map(n => {
    const nodeType = TYPE_MAP[String(n.type)] || 'midEvent'
    const baseNode = {
      id:     n.id,
      type:   nodeType,
      name:   n.name,
      width:  nodeType === 'gate' ? 56 : 120,
      height: nodeType === 'gate' ? 56 : 60,
      // x/y ignored — layout will be applied after import
      x: 0, y: 0,
      // Store gate type on the node (used to render the logical operator label)
      gateType: GATE_MAP[String(n.gate)] || null,
    }

    // Attach event metadata when present
    if (n.event) {
      baseNode.eventId          = n.event.id          || null
      baseNode.description      = n.event.description || ''
      baseNode.errorLevel       = n.event.errorLevel  || ''
      baseNode.priority         = n.event.priority    ?? 0
      baseNode.probability      = n.event.probability ?? null
      baseNode.showProbability  = n.event.showProbability ?? null
      baseNode.rules            = Array.isArray(n.event.rules) ? n.event.rules : []
      baseNode.investigateMethod = n.event.investigateMethod || ''
      baseNode.documents        = Array.isArray(n.event.documents) ? n.event.documents : []
    }

    // Preserve transfer reference if present
    if (n.transfer) baseNode.transfer = n.transfer

    return baseNode
  })

  // linkList: sourceId = child, targetId = parent
  // Our format:  from = parent,  to = child  (reversed)
  const edges = json.linkList.map((l, i) => ({
    id:   l.id || `e_${i}`,
    from: l.targetId,   // parent
    to:   l.sourceId,   // child
  }))

  return { nodes, edges }
}

// ── Standard format normaliser ────────────────────────────────────
function parseStandardFormat(json) {
  const nodes = (json.nodes || []).map(n => ({
    width: 120, height: 60, ...n,
  }))
  const edges = (json.edges || []).map((ed, i) => ({
    ...ed, id: ed.id || `e${i}`,
  }))
  return { nodes, edges }
}

export default function Toolbar({ projectName = '未命名项目', canvasWidth, aiAssistantRef, fitRef }) {
  const { state } = useEditorStore()
  const { setGraph, setLayoutType, setAiIssues, undo, redo } = useEditorActions()
  const navigate = useNavigate()
  const [searchParams] = useSearchParams()
  const fileInputRef = useRef(null)
  const [showAiImport, setShowAiImport] = useState(false)

  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1

  function withLayoutAnchors(nodes, edges, layoutType) {
    const nodeMap = {}
    nodes.forEach(n => { nodeMap[n.id] = n })
    return edges.map(e => {
      const fromNode = nodeMap[e.from]
      const toNode = nodeMap[e.to]
      if (!fromNode || !toNode) return e
      const pick = selectAnchorsByLayout(fromNode, toNode, layoutType)
      return { ...e, fromAnchor: pick.fromAnchor, toAnchor: pick.toAnchor }
    })
  }

  // ── Import JSON ───────────────────────────────────────────────
  function handleImportJSON(file) {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const json = JSON.parse(e.target.result)

        // Auto-detect format: external (nodeList/linkList) vs standard (nodes/edges)
        let nodes, edges
        if (Array.isArray(json.nodeList) && Array.isArray(json.linkList)) {
          ;({ nodes, edges } = parseExternalFormat(json))
          message.success(`外部格式解析成功：${nodes.length} 个节点，${edges.length} 条连线，已自动排版`)
        } else {
          ;({ nodes, edges } = parseStandardFormat(json))
          message.success('JSON 导入成功，已自动排版')
        }

        const layoutType = 'vertical'
        const laid = computeLayout(nodes, edges, canvasWidth || 900)
        const anchoredEdges = withLayoutAnchors(laid, edges, layoutType)
        setLayoutType(layoutType)
        setGraph(laid, anchoredEdges)
        setAiIssues([])
      } catch (err) {
        message.error('JSON 格式解析失败，请检查文件内容')
        console.error(err)
      }
    }
    reader.readAsText(file)
    return false // prevent antd auto upload
  }

  // ── Load Demo ─────────────────────────────────────────────────
  function handleLoadDemo() {
    const rawNodes = DEMO_JSON.nodes.map(n => ({ width: 120, height: 60, ...n }))
    const edges = DEMO_JSON.edges
    const layoutType = 'vertical'
    const laid = computeLayout(rawNodes, edges, canvasWidth || 900)
    const anchoredEdges = withLayoutAnchors(laid, edges, layoutType)
    setLayoutType(layoutType)
    setGraph(laid, anchoredEdges)
    setAiIssues([])
    message.success('示例数据已加载')
  }

  // ── Export JSON ───────────────────────────────────────────────
  function handleExport() {
    const exportData = {
      rootId: state.nodes.find(n =>
        !state.edges.some(e => e.to === n.id)
      )?.id || null,
      nodes: state.nodes.map(({ x, y, width, height, ...rest }) => rest), // strip coordinates
      edges: state.edges.map(({ id, from, to }) => ({ id, from, to })),
    }
    const blob = new Blob([JSON.stringify(exportData, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${projectName}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出 JSON 文件')
  }

  // ── Export SVG ───────────────────────────────────────────────
  function handleExportSvg() {
    if (state.nodes.length === 0) { message.warning('画布为空，无法导出'); return }
    const svg = buildFaultTreeSVG(state.nodes, state.edges)
    if (!svg) { message.error('SVG 生成失败'); return }
    downloadSvg(svg, `${projectName}.svg`)
    message.success('已导出 SVG 文件')
  }

  // ── Export PNG ───────────────────────────────────────────────
  function handleExportPng() {
    if (state.nodes.length === 0) { message.warning('画布为空，无法导出'); return }
    const svg = buildFaultTreeSVG(state.nodes, state.edges)
    if (!svg) { message.error('PNG 生成失败'); return }
    downloadSvgAsPng(svg, `${projectName}.png`)
    message.success('PNG 导出中...')
  }

  // ── AI Import complete ───────────────────────────────────────
  function handleAiImportComplete(result) {
    const nodes = (result?.nodes ?? []).map(n => ({ width: 120, height: 60, ...n }))
    const edges = result?.edges ?? []
    if (!nodes.length) { message.warning('AI 生成结果为空'); return }
    const layoutType = 'vertical'
    const laid = computeLayout(nodes, edges, canvasWidth || 900)
    const anchoredEdges = withLayoutAnchors(laid, edges, layoutType)
    setLayoutType(layoutType)
    setGraph(laid, anchoredEdges)
    setAiIssues([])
    setShowAiImport(false)
    message.success('AI 识别内容已导入画布')
  }

  // ── Auto Layout ───────────────────────────────────────────────
  function handleApplyLayout(kind) {
    if (state.nodes.length === 0) { message.warning('画布为空，请先添加节点'); return }

    const laid = kind === 'horizontal'
      ? computeHorizontalLayout(state.nodes, state.edges)
      : kind === 'grid'
        ? computeGridLayout(state.nodes, state.edges)
        : kind === 'force'
          ? computeForceLayout(state.nodes, state.edges)
          : computeLayout(state.nodes, state.edges, canvasWidth || 900)
    const layoutType = kind === 'horizontal' || kind === 'grid' || kind === 'force' ? kind : 'vertical'
    const anchoredEdges = withLayoutAnchors(laid, state.edges, layoutType)

    setLayoutType(layoutType)
    setGraph(laid, anchoredEdges)
    const label = kind === 'horizontal'
      ? '横向树形'
      : kind === 'grid'
        ? '均匀网格'
        : kind === 'force'
          ? '力导向'
          : '竖向树形'
    message.success(`已应用${label}排版`)
    // 排版完成后自动适应屏幕
    setTimeout(() => fitRef?.current?.(), 100)
  }

  // ── Logic Validation ─────────────────────────────────────────────
  function handleAiCheck() {
    if (state.nodes.length === 0) { message.warning('画布为空，无法校验'); return }
    const issues = validateFaultTree(state.nodes, state.edges)
    setAiIssues(issues)
    if (issues.length === 0) {
      message.success('逻辑校验通过：逻辑结构无异常')
    } else {
      const errors = issues.filter(i => i.level === 'error').length
      const warnings = issues.filter(i => i.level === 'warning').length
      message.warning(`发现 ${errors} 个错误，${warnings} 个警告，详情见属性面板`)
    }
  }

  async function handleSaveVersion() {
    const projectId = searchParams.get('id')
    if (!projectId) { message.warning('无法获取项目 ID'); return }
    if (state.nodes.length === 0) { message.warning('画布为空，无法保存版本'); return }
    try {
      const snapshot = { nodes: state.nodes, edges: state.edges }
      const ver = await saveVersion(projectId, snapshot)
      message.success(`版本 ${ver.label} 已保存`)
    } catch {
      message.error('版本保存失败')
    }
  }

  return (
    <>
    <div className="flex items-center gap-2 px-4 h-14 bg-white border-b border-gray-200 shrink-0 z-20">
      {/* Back */}
      <Tooltip title="返回仪表盘">
        <Button
          type="text"
          icon={<ArrowLeftOutlined />}
          onClick={() => navigate('/dashboard')}
          className="text-gray-500"
        />
      </Tooltip>

      <span className="font-semibold text-gray-800 text-lg max-w-40 truncate border-gray-200 px-2">{projectName || '故障树'}</span>
        
        <Tag color="blue" className="text-xs shrink-0">故障树</Tag>

      <span className="mx-1 w-px h-5 bg-gray-200" />

      {/* 隐藏 JSON 文件输入 */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".json"
        style={{ display: 'none' }}
        onChange={e => {
          const file = e.target.files?.[0]
          if (file) handleImportJSON(file)
          e.target.value = ''
        }}
      />

      {/* Import dropdown */}
      <Dropdown
        menu={{
          items: [
            { key: 'json', icon: <UploadOutlined />, label: 'JSON 文件导入' },
            { key: 'ai',   icon: <RobotOutlined />,  label: 'AI 文档识别导入' },
          ],
          onClick: ({ key }) => {
            if (key === 'json') fileInputRef.current?.click()
            if (key === 'ai')   setShowAiImport(true)
          },
        }}
        trigger={['hover']}
      >
        <Button icon={<UploadOutlined />} size="small">导入 <DownOutlined /></Button>
      </Dropdown>

      {/* Export dropdown */}
      <Dropdown
        menu={{
          items: [
            { key: 'json', icon: <DownloadOutlined />,  label: 'JSON' },
            { key: 'svg',  icon: <FileImageOutlined />, label: 'SVG'  },
            { key: 'png',  icon: <FileImageOutlined />, label: 'PNG'  },
          ],
          onClick: ({ key }) => {
            if (key === 'json') handleExport()
            if (key === 'svg')  handleExportSvg()
            if (key === 'png')  handleExportPng()
          },
        }}
        trigger={['hover']}
      >
        <Button icon={<DownloadOutlined />} size="small">导出 <DownOutlined /></Button>
      </Dropdown>

      {/* Save Version */}
        <Tooltip title="另存为版本快照">
            <Button
            icon={<SaveOutlined />}
            size="small"
            onClick={handleSaveVersion}
            >
            另存
            </Button>
        </Tooltip>

      <span className="mx-1 w-px h-5 bg-gray-200" />

      {/* Undo / Redo */}
      <Tooltip title="撤销 (Ctrl+Z)">
        <Button type="text" icon={<UndoOutlined />} onClick={undo} disabled={!canUndo} size="small" />
      </Tooltip>
      <Tooltip title="重做 (Ctrl+Y / Ctrl+Shift+Z)">
        <Button type="text" icon={<RedoOutlined />} onClick={redo} disabled={!canRedo} size="small" />
      </Tooltip>

      <span className="mx-1 w-px h-5 bg-gray-200" />

      <div className="ml-auto flex gap-2 items-center justify-center">
        <Dropdown
          menu={{
            items: [
              { key: 'vertical', icon: <ApartmentOutlined />, label: '竖向树形' },
              { key: 'horizontal', icon: <ApartmentOutlined />, label: '横向树形' },
              { key: 'grid', icon: <ApartmentOutlined />, label: '均匀网格' },
              { key: 'force', icon: <ApartmentOutlined />, label: '力导向（复杂连接）' },
            ],
            onClick: ({ key }) => handleApplyLayout(key),
          }}
          trigger={['hover']}
        >
          <Button icon={<ApartmentOutlined />} size="small">排版 <DownOutlined /></Button>
        </Dropdown>

        {/* 逻辑校验 */}
        <Tooltip title="故障树逻辑校验">
          <Button
            icon={<CheckOutlined />}
            size="small"
            onClick={handleAiCheck}
          >
            逻辑校验
          </Button>
        </Tooltip>

        {/* AI 助手 */}
        <Tooltip title="AI 逻辑分析">
          <Button
            icon={<ThunderboltOutlined />}
            size="small"
            type="primary"
            ghost
            onClick={() => aiAssistantRef?.current?.open()}
          >
            AI 助手
          </Button>
        </Tooltip>

         {/* Collaboration */}
        <Tooltip title="协作与版本管理">
          <Button
            icon={<TeamOutlined />}
            size="small"
            onClick={() => {
              const id = searchParams.get('id')
              if (id) navigate(`/collaboration?id=${id}&type=ft`)
              else message.warning('请先保存项目')
            }}
          >
            协作
          </Button>
        </Tooltip>

        

        <span className="mx-2 w-px h-5 bg-gray-200" />

        <UserAvatar size={30} />
      </div>
    </div>

    {/* AI 文档识别导入弹窗 */}
    <DocumentUploadModal
      open={showAiImport}
      target="faultTree"
      onComplete={handleAiImportComplete}
      onCancel={() => setShowAiImport(false)}
    />
  </>
  )
}
