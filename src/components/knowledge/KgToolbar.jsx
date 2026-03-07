/**
 * KgToolbar — 知识图谱编辑器顶部工具栏
 * 样式与 Toolbar.jsx 完全一致（h-14 bg-white border-b）
 */
import { useRef } from 'react'
import { Button, Tooltip, Upload, message, Divider, Tag } from 'antd'
import {
  ArrowLeftOutlined, UndoOutlined, RedoOutlined,
  DownloadOutlined, UploadOutlined, ApartmentOutlined,
  ThunderboltOutlined, SaveOutlined, TeamOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useKnowledgeStore, useKnowledgeActions } from '../../store/useKnowledgeStore'
import UserAvatar from '../common/UserAvatar'
import { validateGraph, saveVersion } from '../../services/aiService'

// ─── Dagre 自动排版（水平树形布局）────────────────────────────────
function autoLayout(nodes, edges) {
  if (!nodes.length) return nodes
  // 简单的层级排版（TODO: 接入 dagre 或力导向布局）
  // 将节点按连通性排布，此处做基础的格状排布
  const cols = Math.ceil(Math.sqrt(nodes.length))
  const gap = 180
  return nodes.map((n, i) => ({
    ...n,
    position: {
      x: (i % cols) * gap + 80,
      y: Math.floor(i / cols) * 120 + 60,
    },
  }))
}

export default function KgToolbar({ kgName, kgId }) {
  const navigate = useNavigate()
  const { rfNodes, rfEdges, historyIndex, history } = useKnowledgeStore()
  const { setGraph, setAiIssues, undo, redo } = useKnowledgeActions()
  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  // ── 导出 JSON ──────────────────────────────────────────────
  function handleExport() {
    const data = { rfNodes, rfEdges, exportedAt: new Date().toISOString() }
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `${kgName || 'knowledge-graph'}.json`
    a.click()
    URL.revokeObjectURL(url)
    message.success('已导出 JSON')
  }

  // ── 导入 JSON ──────────────────────────────────────────────
  function handleImport(file) {
    const reader = new FileReader()
    reader.onload = e => {
      try {
        const parsed = JSON.parse(e.target.result)
        const nodes = parsed.rfNodes ?? parsed.nodes ?? []
        const edges = parsed.rfEdges ?? parsed.edges ?? []
        setGraph(nodes, edges)
        message.success(`已导入 ${nodes.length} 个节点，${edges.length} 条关系`)
      } catch {
        message.error('文件格式不正确')
      }
    }
    reader.readAsText(file)
    return false  // 阻止自动上传
  }

  // ── 自动排版 ────────────────────────────────────────────────
  function handleLayout() {
    const newNodes = autoLayout(rfNodes, rfEdges)
    setGraph(newNodes, rfEdges)
    message.success('已应用自动排版')
    // TODO: 接入 dagre 力导向布局
  }

  // ── AI 分析 ─────────────────────────────────────────────────
  async function handleAiAnalyze() {
    message.loading({ content: 'AI 分析中...', key: 'kg-ai' })
    try {
      const { issues } = await validateGraph(rfNodes, rfEdges, 'knowledge')
      setAiIssues(issues)
      message.success({ content: `分析完成，发现 ${issues.length} 个问题`, key: 'kg-ai' })
      // TODO: 接入大模型实体关系推理与优化建议
    } catch {
      message.error({ content: 'AI 分析失败', key: 'kg-ai' })
    }
  }

  // ── 另存为版本 ──────────────────────────────────────────────
  async function handleSaveVersion() {
    if (!kgId) return
    try {
      const v = await saveVersion(kgId, { rfNodes, rfEdges }, '')
      message.success(`已保存版本：${v.label}`)
    } catch {
      message.error('版本保存失败')
    }
  }

  return (
    <div className="h-14 bg-white border-b border-gray-200 flex items-center gap-2 px-4 shrink-0 z-10">
      {/* 返回 */}
      <Tooltip title="返回仪表盘">
        <Button
          icon={<ArrowLeftOutlined />}
          type="text"
          onClick={() => navigate('/dashboard')}
        />
      </Tooltip>

      {/* 项目名 */}
      <span className="font-semibold text-gray-800 text-lg max-w-40 truncate  border-gray-200 px-2 ">
        {kgName || '知识图谱'} 
      </span>

      <Tag color="purple" className="text-xs shrink-0">知识图谱</Tag>

      <span className="mx-1 w-px h-5 bg-gray-200" />

      {/* 导入 */}
      <Upload accept=".json" beforeUpload={handleImport} showUploadList={false}>
        <Tooltip title="导入 JSON">
          <Button icon={<UploadOutlined />} size="small">导入</Button>
        </Tooltip>
      </Upload>

      {/* 导出 */}
      <Tooltip title="导出 JSON">
        <Button icon={<DownloadOutlined />} size="small" onClick={handleExport}>导出</Button>
      </Tooltip>

      {/* 另存版本 */}
      <Tooltip title="另存为版本">
        <Button icon={<SaveOutlined />} size="small" onClick={handleSaveVersion} />
      </Tooltip>

      <span className="mx-1 w-px h-5 bg-gray-200" />

      {/* 撤销 */}
      <Tooltip title="撤销 (Ctrl+Z)">
        <Button type="text" icon={<UndoOutlined />} size="small" disabled={!canUndo} onClick={undo} />
      </Tooltip>

      {/* 重做 */}
      <Tooltip title="重做 (Ctrl+Y)">
        <Button type="text" icon={<RedoOutlined />} size="small" disabled={!canRedo} onClick={redo} />
      </Tooltip>

      
      <span className="mx-1 w-px h-5 bg-gray-200" />


      <div className="ml-auto flex gap-2 items-center justify-center">
      {/* 自动排版 */}
      <Tooltip title="自动排版">
        <Button icon={<ApartmentOutlined />} size="small" onClick={handleLayout}>排版</Button>
      </Tooltip>

      {/* AI 分析 */}
      <Tooltip title="AI 逻辑分析">
        <Button
          icon={<ThunderboltOutlined />}
          size="small"
          type="primary"
          ghost
          onClick={handleAiAnalyze}
        >
          AI 分析
        </Button>
      </Tooltip>

      

      {/* 协作 */}
      <Tooltip title="协作与版本管理">
        <Button
          icon={<TeamOutlined />}
          size="small"
          onClick={() => {
            if (kgId) navigate(`/collaboration?id=${kgId}&type=kg`)
            else message.warning('请先保存图谱')
          }}
        >
          协作
        </Button>
      </Tooltip>
      
      <span className="mx-1 w-px h-5 bg-gray-200" />
      
      <UserAvatar size={30} />
      </div>
    </div>
  )
}
