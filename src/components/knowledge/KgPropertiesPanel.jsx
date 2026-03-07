/**
 * KgPropertiesPanel — 右侧属性面板
 * 与 PropertiesPanel.jsx 保持一致的宽度（256px）和折叠动画
 */
import { useEffect } from 'react'
import { Form, Input, Select, Button, Divider, Alert, Typography } from 'antd'
import { RightOutlined, LeftOutlined, DeleteOutlined } from '@ant-design/icons'
import { useKnowledgeStore, useKnowledgeActions } from '../../store/useKnowledgeStore'
import { ENTITY_TYPES } from './KgEntityPalette'

const { TextArea } = Input
const { Text } = Typography

const ENTITY_TYPE_OPTIONS = Object.entries(ENTITY_TYPES).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}))

export default function KgPropertiesPanel({ collapsed, onCollapsedChange }) {
  const { rfNodes, rfEdges, selectedIds, selectedEdgeId, aiIssues } = useKnowledgeStore()
  const { updateNode, deleteNode, updateEdge, deleteEdge } = useKnowledgeActions()
  const [form] = Form.useForm()

  const selectedNode = rfNodes.find(n => n.id === selectedIds[0])
  const selectedEdge = rfEdges.find(e => e.id === selectedEdgeId)

  // 同步表单值
  useEffect(() => {
    if (selectedNode) {
      form.setFieldsValue({
        label: selectedNode.data?.label ?? '',
        entityType: selectedNode.type ?? 'entityNode',
        description: selectedNode.data?.description ?? '',
        sourceDoc: selectedNode.data?.sourceDoc ?? '',
      })
    } else if (selectedEdge) {
      form.setFieldsValue({ label: selectedEdge.label ?? '' })
    } else {
      form.resetFields()
    }
  }, [selectedNode?.id, selectedEdge?.id])

  function handleApplyNode() {
    const vals = form.getFieldsValue()
    if (!selectedNode) return
    updateNode(selectedNode.id, {
      label: vals.label,
      description: vals.description,
      sourceDoc: vals.sourceDoc,
    })
  }

  function handleApplyEdge() {
    const vals = form.getFieldsValue()
    if (!selectedEdge) return
    updateEdge(selectedEdge.id, { label: vals.label })
  }

  const nodeIssues = aiIssues.filter(i => i.nodeId === selectedNode?.id)

  return (
    <div
      className="absolute right-0 top-0 bottom-0 z-20 bg-white border-l border-gray-200 flex flex-col transition-all duration-200 overflow-hidden shadow-sm"
      style={{ width: collapsed ? 0 : 256 }}
    >
      {/* 折叠按钮 */}
      <button
        className="absolute -left-7 top-1/2 -translate-y-1/2 w-6 h-12 bg-white border border-gray-200 rounded-l flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer z-30 shadow-sm"
        onClick={() => onCollapsedChange?.(!collapsed)}
        title={collapsed ? '展开属性' : '收起属性'}
      >
        {collapsed ? <LeftOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
      </button>

      <div className="px-3 py-3 border-b border-gray-100">
        <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">属性面板</p>
      </div>

      <div className="flex-1 overflow-y-auto p-3">
        {!selectedNode && !selectedEdge && (
          <Text className="text-gray-400 text-xs">点击节点或连线查看属性</Text>
        )}

        {/* 节点属性 */}
        {selectedNode && (
          <Form form={form} layout="vertical" size="small">
            <Form.Item label="节点 ID">
              <Input value={selectedNode.id} disabled size="small" />
            </Form.Item>

            <Form.Item name="entityType" label="实体类型">
              <Select
                options={ENTITY_TYPE_OPTIONS}
                onChange={val => updateNode(selectedNode.id, { entityType: val })}
              />
            </Form.Item>

            <Form.Item name="label" label="名称">
              <Input maxLength={60} showCount />
            </Form.Item>

            <Form.Item name="description" label="描述">
              <TextArea rows={2} maxLength={200} showCount />
            </Form.Item>

            <Form.Item name="sourceDoc" label="溯源文档">
              <Input
                placeholder="来源文档名称或 URL"
                // TODO: 后端文档关联选择器
              />
            </Form.Item>

            {nodeIssues.length > 0 && (
              <>
                <Divider style={{ margin: '8px 0' }} />
                {nodeIssues.map((issue, i) => (
                  <Alert
                    key={i}
                    type={issue.level === 'error' ? 'error' : issue.level === 'warning' ? 'warning' : 'info'}
                    message={issue.message}
                    showIcon
                    className="mb-2"
                    style={{ fontSize: 11 }}
                  />
                ))}
              </>
            )}

            <div className="flex gap-2 mt-2">
              <Button size="small" type="primary" onClick={handleApplyNode} className="flex-1">
                应用
              </Button>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => deleteNode(selectedNode.id)}
              >
                删除
              </Button>
            </div>
          </Form>
        )}

        {/* 边属性 */}
        {selectedEdge && !selectedNode && (
          <Form form={form} layout="vertical" size="small">
            <Form.Item label="连线 ID">
              <Input value={selectedEdge.id} disabled size="small" />
            </Form.Item>
            <Text className="text-xs text-gray-500 block mb-2">
              {rfNodes.find(n => n.id === selectedEdge.source)?.data?.label ?? selectedEdge.source}
              {' → '}
              {rfNodes.find(n => n.id === selectedEdge.target)?.data?.label ?? selectedEdge.target}
            </Text>
            <Form.Item name="label" label="关系标签">
              <Input placeholder="例：导致、属于、依赖..." maxLength={30} />
            </Form.Item>
            <div className="flex gap-2 mt-2">
              <Button size="small" type="primary" onClick={handleApplyEdge} className="flex-1">
                应用
              </Button>
              <Button
                size="small"
                danger
                icon={<DeleteOutlined />}
                onClick={() => deleteEdge(selectedEdge.id)}
              >
                删除
              </Button>
            </div>
          </Form>
        )}
      </div>
    </div>
  )
}
