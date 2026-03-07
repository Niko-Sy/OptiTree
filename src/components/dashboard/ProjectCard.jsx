// 项目卡片组件，支持故障树项目和知识图谱项目两种类型
import { Card, Button, Tag, Popconfirm, Tooltip } from 'antd'
import {
  FolderOpenOutlined, DeleteOutlined, ClockCircleOutlined,
  ApartmentOutlined, NodeIndexOutlined, TeamOutlined,
  ShareAltOutlined, ApiOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

/** project.type === 'kg' 时渲染知识图谱卡片，否则渲染故障树卡片 */
export default function ProjectCard({ project, onDelete }) {
  const navigate = useNavigate()
  const isKg = project.type === 'kg'

  function handleOpen(e) {
    e?.stopPropagation()
    if (isKg) navigate(`/knowledge?id=${project.id}`)
    else navigate(`/editor?id=${project.id}`)
  }

  function handleCollaboration(e) {
    e.stopPropagation()
    navigate(`/collaboration?id=${project.id}&type=${isKg ? 'kg' : 'ft'}`)
  }

  const date = new Date(project.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  const iconBg   = isKg ? 'bg-purple-50 border-purple-100'   : 'bg-blue-50 border-blue-100'
  const iconColor = isKg ? '#722ed1' : '#1677ff'
  const IconComp  = isKg ? ApiOutlined : ApartmentOutlined

  return (
    <Card
      className="fade-in-up hover:shadow-md transition-shadow cursor-pointer"
      styles={{ body: { padding: '16px' } }}
      onClick={handleOpen}
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
            </div>
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              <ClockCircleOutlined />
              <span>{date}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1 shrink-0">
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

      <div className="mt-3 flex gap-2">
        <Button
          type="primary"
          ghost
          icon={<FolderOpenOutlined />}
          className="flex-1"
          size="small"
          onClick={handleOpen}
          style={isKg ? { borderColor: '#722ed1', color: '#722ed1' } : {}}
        >
          {isKg ? '打开知识图谱' : '打开编辑器'}
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
    </Card>
  )
}
