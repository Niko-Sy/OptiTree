// 项目卡片组件，支持故障树项目和知识图谱项目两种类型
import { Card, Button, Tag, Popconfirm, Tooltip, Progress } from 'antd'
import {
  FolderOpenOutlined, DeleteOutlined, ClockCircleOutlined,
  ApartmentOutlined, NodeIndexOutlined, TeamOutlined, HistoryOutlined,
  ShareAltOutlined, ApiOutlined, EditOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'
import { useState } from 'react'
import UpdateProjectModal from '../common/UpdateProjectModal'

/** project.type === 'kg' 时渲染知识图谱卡片，否则渲染故障树卡片 */
const GENERATING_STATUSES = new Set(['pending_generating', 'generating'])
const FAILED_STATUSES = new Set(['failed', 'dead', 'cancelled'])

function normalizeWsState(wsState) {
  if (wsState === 'connected') return { color: 'success', label: '连接稳定' }
  if (wsState === 'reconnecting') return { color: 'warning', label: '重连中' }
  if (wsState === 'polling' || wsState === 'recovering') return { color: 'gold', label: '兜底恢复中' }
  return null
}

function getStatusMeta(status) {
  if (status === 'pending_generating' || status === 'generating') return { color: 'processing', label: '生成中' }
  if (status === 'failed') return { color: 'error', label: '生成失败' }
  return { color: 'success', label: '已完成' }
}

function resolveDisplayStatus(projectStatus, taskInfo) {
  if (taskInfo?.status) {
    if (taskInfo.status === 'completed') return 'completed'
    if (FAILED_STATUSES.has(taskInfo.status)) return 'failed'
    return 'generating'
  }
  if (projectStatus === 'failed') return 'failed'
  if (GENERATING_STATUSES.has(projectStatus)) return 'generating'
  return 'completed'
}

function toTimeLabel(value) {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  return date.toLocaleTimeString('zh-CN', { hour12: false })
}

function isActionElement(target) {
  if (!target || typeof target.closest !== 'function') return false
  return Boolean(target.closest('button, a, input, textarea, [role="button"], .ant-btn, .ant-popover, .ant-tooltip, .ant-modal, .ant-modal-wrap, .ant-modal-mask'))
}

export default function ProjectCard({ cardId, highlighted = false, project, onDelete, taskProgress, taskInfo, onRetry, retryLoading = false, onUpdated }) {
  const navigate = useNavigate()
  const [showEditModal, setShowEditModal] = useState(false)
  const isKg = project.type === 'kg'
  const generationStatus = project.generation_status || 'completed'
  const displayStatus = resolveDisplayStatus(generationStatus, taskInfo)
  const isGenerating = displayStatus === 'generating'
  const isFailed = displayStatus === 'failed'
  const canOpen = displayStatus === 'completed'
  const statusMeta = getStatusMeta(displayStatus)
  const wsMeta = normalizeWsState(taskInfo?.wsState)
  const stageLabel = taskInfo?.stageLabel || (isGenerating ? '正在生成，请稍候...' : '')
  const progressValue = taskInfo?.progress ?? taskProgress ?? 0
  const failedReason = taskInfo?.errorMessage || '生成失败，可使用原参数重试。'
  const retryCount = taskInfo?.retryCount ?? 0
  const updatedTime = toTimeLabel(taskInfo?.updatedAt)
  const stageHistory = Array.isArray(taskInfo?.stageHistory) ? taskInfo.stageHistory : []

  function openProject() {
    if (showEditModal) return
    if (!canOpen) return
    if (isKg) navigate(`/knowledge?id=${project.id}`)
    else navigate(`/editor?id=${project.id}`)
  }

  function handleCardClick(e) {
    if (isActionElement(e?.target)) return
    openProject()
  }

  function handleOpenClick(e) {
    e.stopPropagation()
    openProject()
  }

  function handleCollaboration(e) {
    e.stopPropagation()
    navigate(`/collaboration?id=${project.id}&type=${isKg ? 'kg' : 'ft'}`)
  }

  function handleRetry(e) {
    e.stopPropagation()
    onRetry?.(project)
  }

  function handleEdit(e) {
    e.preventDefault()
    e.stopPropagation()
    e.nativeEvent?.stopImmediatePropagation?.()
    setShowEditModal(true)
  }

  const date = new Date(project.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  const iconBg   = isKg ? 'bg-purple-50 border-purple-100'   : 'bg-blue-50 border-blue-100'
  const iconColor = isKg ? '#722ed1' : '#1677ff'
  const IconComp  = isKg ? ApiOutlined : ApartmentOutlined

  return (
    <Card
      id={cardId}
      className={`fade-in-up hover:shadow-md transition-shadow ${canOpen ? 'cursor-pointer' : 'cursor-not-allowed'} ${highlighted ? 'ring-2 ring-blue-400 ring-offset-1' : ''}`}
      styles={{ body: { padding: '16px' } }}
      onClick={handleCardClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className={`w-9 h-9 rounded-lg border flex items-center justify-center shrink-0 ${iconBg}`}>
            <IconComp style={{ fontSize: 18, color: iconColor }} />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5">
              <p className="font-semibold text-gray-800 truncate text-sm">{project.name}</p>
              {isKg && (
                <Tag color="purple" className="text-xs shrink-0">知识图谱</Tag>
              )}
              {!isKg && (<Tag color="blue" className="text-xs shrink-0">故障树</Tag>)}
              {statusMeta.color!=="success" && <Tag color={statusMeta.color} className="text-xs shrink-0">{statusMeta.label}</Tag>}
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              <ClockCircleOutlined />
              <span>{date}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
          <Tooltip title="修改项目详情">
            <Button
              type="text"
              icon={<EditOutlined />}
              size="small"
              onClick={handleEdit}
            />
          </Tooltip>
          {/* 删除按钮 */}
          <Popconfirm
            title={isKg ? '删除知识图谱' : '删除项目'}
            description="确定删除？操作不可撤销。"
            onConfirm={e => { e.stopPropagation(); onDelete(project.id, isKg) }}
            onCancel={e => e.stopPropagation()}
            okText="删除"
            okType="danger"
            cancelText="取消"
          >
            <Tooltip title="删除">
              <Button
                type="text"
                danger
                icon={<DeleteOutlined />}
                size="small"
                onClick={e => e.stopPropagation()}
              />
            </Tooltip>
          </Popconfirm>
        </div>
      </div>

      {/* 统计信息 */}
      <div className="mt-3 flex items-center gap-3 flex-wrap">
        {isKg ? (
          <>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <ShareAltOutlined />
              <span>{project.entityCount ?? 0} 实体</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <NodeIndexOutlined />
              <span>{project.relationCount ?? 0} 关系</span>
            </div>
          </>
        ) : (
          <>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <NodeIndexOutlined />
              <span>{project.nodeCount ?? 0} 节点</span>
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-500">
              <NodeIndexOutlined className="rotate-90" />
              <span>{project.edgeCount ?? 0} 连接</span>
            </div>
          </>
        )}
        {project.tags?.map(tag => (
          <Tag key={tag} color={isKg ? 'purple' : 'blue'} className="text-xs">{tag}</Tag>
        ))}
      </div>

      {isGenerating && (
        <div className="mt-3">
          <Progress
            percent={Math.max(0, Math.min(100, Math.round(progressValue)))}
            status="active"
            size="small"
            strokeColor={{ from: '#1677ff', to: '#52c41a' }}
          />
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <span className="text-xs text-gray-500 truncate">{stageLabel}</span>
            <div className="flex items-center gap-1 shrink-0">
              {retryCount > 0 && (
                <Tag color="orange" className="text-[10px] m-0 whitespace-nowrap">重连 {retryCount}</Tag>
              )}
              {wsMeta && (
                <Tag color={wsMeta.color} className="text-[10px] m-0 whitespace-nowrap">{wsMeta.label}</Tag>
              )}
            </div>
          </div>
          <div className="mt-1 flex items-center justify-between gap-2 text-[11px] text-gray-400">
            <span>{updatedTime ? `最近更新 ${updatedTime}` : '等待首条任务进度'}</span>
            {stageHistory.length > 0 && (
              <Tooltip
                placement="topRight"
                title={(
                  <div className="max-w-64">
                    {stageHistory.map((item) => (
                      <div key={`${item.at}-${item.label}`} className="text-xs leading-5">
                        {toTimeLabel(item.at) || '--:--:--'} · {item.label}
                      </div>
                    ))}
                  </div>
                )}
              >
                <span className="inline-flex items-center gap-1 cursor-help text-blue-500">
                  <HistoryOutlined /> 阶段记录
                </span>
              </Tooltip>
            )}
          </div>
        </div>
      )}

      {isFailed && (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs text-red-500 truncate">{failedReason}</p>
          <Button size="small" type="primary" danger ghost onClick={handleRetry} loading={retryLoading}>
            一键重试
          </Button>
        </div>
      )}

      <div className="mt-3 flex gap-2">
        <Button
          type="primary"
          ghost
          icon={<FolderOpenOutlined />}
          className="flex-1"
          size="small"
          onClick={handleOpenClick}
          disabled={!canOpen}
          style={isKg ? { borderColor: '#722ed1', color: '#722ed1' } : {}}
        >
          {isGenerating ? '生成中...' : isFailed ? '生成失败' : (isKg ? '打开知识图谱' : '打开编辑器')}
        </Button>
        <Tooltip title="协作与版本管理">
          <Button
            icon={<TeamOutlined />}
            size="small"
            onClick={handleCollaboration}
          >
            协作
          </Button>
        </Tooltip>
      </div>

      <UpdateProjectModal
        open={showEditModal}
        project={project}
        onCancel={() => setShowEditModal(false)}
        onUpdated={(nextProject) => {
          setShowEditModal(false)
          onUpdated?.(nextProject)
        }}
      />
    </Card>
  )
}
