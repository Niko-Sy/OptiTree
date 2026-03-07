// 编辑器顶部工具栏组件，包含项目名称、导入/导出、撤销/重做、自动排版、AI 校验等功能按钮
import { useRef } from 'react'
import { Button, Tooltip, message, Upload } from 'antd'
import {
  UndoOutlined, RedoOutlined, DownloadOutlined, UploadOutlined,
  ApartmentOutlined, RobotOutlined, ArrowLeftOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import UserAvatar from '../common/UserAvatar'
import { useEditorStore, useEditorActions } from '../../store/useEditorStore'
import { computeLayout } from '../../utils/layoutAlgorithm'
import { validateFaultTree } from '../../utils/aiValidator'

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

export default function Toolbar({ projectName = '未命名项目', canvasWidth }) {
  const { state } = useEditorStore()
  const { setGraph, setAiIssues, undo, redo } = useEditorActions()
  const navigate = useNavigate()
  const fileInputRef = useRef(null)

  const canUndo = state.historyIndex > 0
  const canRedo = state.historyIndex < state.history.length - 1

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

        const laid = computeLayout(nodes, edges, canvasWidth || 900)
        setGraph(laid, edges)
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
    const laid = computeLayout(rawNodes, edges, canvasWidth || 900)
    setGraph(laid, edges)
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

  // ── Auto Layout ───────────────────────────────────────────────
  function handleAutoLayout() {
    if (state.nodes.length === 0) { message.warning('画布为空，请先添加节点'); return }
    const laid = computeLayout(state.nodes, state.edges, canvasWidth || 900)
    setGraph(laid, state.edges)
    message.success('自动排版完成')
  }

  // ── AI Validation ─────────────────────────────────────────────
  function handleAiCheck() {
    if (state.nodes.length === 0) { message.warning('画布为空，无法校验'); return }
    const issues = validateFaultTree(state.nodes, state.edges)
    setAiIssues(issues)
    if (issues.length === 0) {
      message.success('AI 校验通过：逻辑结构无异常')
    } else {
      const errors = issues.filter(i => i.level === 'error').length
      const warnings = issues.filter(i => i.level === 'warning').length
      message.warning(`发现 ${errors} 个错误，${warnings} 个警告，详情见属性面板`)
    }
  }

  return (
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

      <span className="text-lg font-medium text-gray-700 max-w-40 truncate">{projectName}</span>

      <span className="mx-1 w-px h-5 bg-gray-200" />

      {/* Import */}
      <Upload beforeUpload={handleImportJSON} showUploadList={false} accept=".json">
        <Tooltip title="导入 JSON 文件">
          <Button icon={<UploadOutlined />} size="small">导入 JSON</Button>
        </Tooltip>
      </Upload>

      <Tooltip title="加载演示数据">
        <Button size="small" onClick={handleLoadDemo}>加载示例</Button>
      </Tooltip>

      <Tooltip title="导出为 JSON">
        <Button icon={<DownloadOutlined />} size="small" onClick={handleExport}>导出 JSON</Button>
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
        {/* Auto Layout */}
        <Tooltip title="BFS 树形自动排版">
          <Button
            icon={<ApartmentOutlined />}
            size="small"
            onClick={handleAutoLayout}
          >
            自动排版
          </Button>
        </Tooltip>

        {/* AI Check */}
        <Tooltip title="AI 逻辑校验">
          <Button
            type="primary"
            icon={<RobotOutlined />}
            size="small"
            onClick={handleAiCheck}
          >
            AI 逻辑校验
          </Button>
        </Tooltip>

        <span className="mx-2 w-px h-5 bg-gray-200" />

        <UserAvatar size={30} />
      </div>
    </div>
  )
}
