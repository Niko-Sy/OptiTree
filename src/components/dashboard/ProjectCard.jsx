import { Card, Button, Tag, Popconfirm, Tooltip } from 'antd'
import {
  FolderOpenOutlined, DeleteOutlined, ClockCircleOutlined,
  ApartmentOutlined, NodeIndexOutlined,
} from '@ant-design/icons'
import { useNavigate } from 'react-router-dom'

export default function ProjectCard({ project, onDelete }) {
  const navigate = useNavigate()

  function handleOpen() {
    navigate(`/editor?id=${project.id}`)
  }

  const date = new Date(project.createdAt).toLocaleDateString('zh-CN', {
    year: 'numeric', month: 'short', day: 'numeric',
  })

  return (
    <Card
      className="fade-in-up hover:shadow-md transition-shadow cursor-pointer"
      bodyStyle={{ padding: '16px' }}
      onClick={handleOpen}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center shrink-0">
            <ApartmentOutlined style={{ fontSize: 18, color: '#1677ff' }} />
          </div>
          <div className="min-w-0">
            <p className="font-semibold text-gray-800 truncate text-sm">{project.name}</p>
            <div className="flex items-center gap-1 text-xs text-gray-400 mt-0.5">
              <ClockCircleOutlined />
              <span>{date}</span>
            </div>
          </div>
        </div>
        <Popconfirm
          title="删除项目"
          description="确定删除此项目？操作不可撤销。"
          onConfirm={e => { e.stopPropagation(); onDelete(project.id) }}
          onCancel={e => e.stopPropagation()}
          okText="删除"
          okType="danger"
          cancelText="取消"
        >
          <Tooltip title="删除项目">
            <Button
              type="text"
              danger
              icon={<DeleteOutlined />}
              size="small"
              onClick={e => e.stopPropagation()}
              className="shrink-0"
            />
          </Tooltip>
        </Popconfirm>
      </div>

      <div className="mt-3 flex items-center gap-3">
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <NodeIndexOutlined />
          <span>{project.nodeCount ?? 0} 节点</span>
        </div>
        <div className="flex items-center gap-1 text-xs text-gray-500">
          <NodeIndexOutlined className="rotate-90" />
          <span>{project.edgeCount ?? 0} 连接</span>
        </div>
        {project.tags?.map(tag => (
          <Tag key={tag} color="blue" className="text-xs">{tag}</Tag>
        ))}
      </div>

      <Button
        type="primary"
        ghost
        icon={<FolderOpenOutlined />}
        className="mt-3 w-full"
        size="small"
        onClick={e => { e.stopPropagation(); handleOpen() }}
      >
        打开编辑器
      </Button>
    </Card>
  )
}
