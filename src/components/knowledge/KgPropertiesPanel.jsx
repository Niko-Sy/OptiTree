/**
 * KgPropertiesPanel — 右侧属性面板
 * 与 PropertiesPanel.jsx 保持一致的宽度（256px）和折叠动画
 * 新增：节点尺寸调节、节点坐标显示、连接线形状切换
 * 修复：折叠按钮在收起状态下仍然可见
 */
import { useEffect } from 'react'
import {
  Form, Input, Select, Button, Divider, Alert,
  Typography, InputNumber, Tooltip,
} from 'antd'
import {
  RightOutlined, LeftOutlined, DeleteOutlined,
  ColumnWidthOutlined, ApartmentOutlined,
} from '@ant-design/icons'
import { useKnowledgeStore, useKnowledgeActions } from '../../store/useKnowledgeStore'
import { ENTITY_TYPES } from './KgEntityPalette'

const { TextArea } = Input
const { Text } = Typography

const ENTITY_TYPE_OPTIONS = Object.entries(ENTITY_TYPES).map(([value, cfg]) => ({
  value,
  label: cfg.label,
}))

// 连接线形状选项
const EDGE_TYPE_OPTIONS = [
  { value: 'smoothstep', label: '折线（默认）' },
  { value: 'bezier',     label: '曲线' },
  { value: 'straight',   label: '直线' },
  { value: 'step',       label: '阶梯线' },
]

// 连线颜色预设
const EDGE_COLORS = [
  '#94a3b8', '#1677ff', '#52c41a', '#faad14',
  '#f5222d', '#722ed1', '#13c3c3',
]

const panelWidth = 256

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
        label:       selectedNode.data?.label       ?? '',
        entityType:  selectedNode.type              ?? 'entityNode',
        description: selectedNode.data?.description ?? '',
        sourceDoc:   selectedNode.data?.sourceDoc   ?? '',
        width:       selectedNode.style?.width      ?? 120,
        height:      selectedNode.style?.height     ?? null,
      })
    } else if (selectedEdge) {
      form.setFieldsValue({
        edgeLabel: selectedEdge.label              ?? '',
        edgeType:  selectedEdge.type               ?? 'smoothstep',
        edgeColor: selectedEdge.style?.stroke      ?? '#94a3b8',
        animated:  selectedEdge.animated           ?? false,
      })
    } else {
      form.resetFields()
    }
  }, [selectedNode?.id, selectedNode?.data, selectedNode?.style, selectedEdge?.id, selectedEdge?.type, selectedEdge?.style]) // eslint-disable-line

  function handleApplyNode() {
    const vals = form.getFieldsValue()
    if (!selectedNode) return
    updateNode(
      selectedNode.id,
      {
        label:       vals.label,
        description: vals.description,
        sourceDoc:   vals.sourceDoc,
      },
      {
        ...(vals.width  ? { width:  vals.width  } : {}),
        ...(vals.height ? { height: vals.height } : {}),
      }
    )
  }

  function handleApplyEdge() {
    const vals = form.getFieldsValue()
    if (!selectedEdge) return
    updateEdge(selectedEdge.id, {
      label:    vals.edgeLabel,
      type:     vals.edgeType,
      animated: vals.animated,
      style: {
        ...(selectedEdge.style ?? {}),
        stroke: vals.edgeColor,
        strokeWidth: 1.5,
      },
      labelStyle:   { fontSize: 11, fill: '#64748b' },
      labelBgStyle: { fill: '#fff', fillOpacity: 0.85 },
    })
  }

  const nodeIssues = aiIssues.filter(i => i.nodeId === selectedNode?.id)

  return (
    // 外层 wrapper：不裁剪内容，让折叠按钮溢出可见
    <div
      className="absolute right-0 top-0 bottom-0 z-20"
      style={{ width: 0, pointerEvents: 'none' }}
    >
      {/* 主面板内容 */}
      <div
        className="absolute right-0 top-0 bottom-0 bg-white/70 backdrop-blur-sm border-l border-gray-200 flex flex-col transition-all duration-200 overflow-hidden shadow-sm"
        style={{ width: collapsed ? 0 : panelWidth, pointerEvents: 'auto' }}
      >
        <div className="px-3 py-3 border-b border-gray-100">
          <p className="text-xs font-semibold text-gray-400 uppercase tracking-wide">属性面板</p>
        </div>

        <div className="flex-1 overflow-y-auto p-3">
          {!selectedNode && !selectedEdge && (
            <Text className="text-gray-400 text-xs">点击节点或连线查看属性</Text>
          )}

          {/* ── 节点属性 ── */}
          {selectedNode && (
            <Form form={form} layout="vertical" size="small">
              <Form.Item label="节点 ID">
                <Input value={selectedNode.id} disabled size="small" />
              </Form.Item>

              <Form.Item label="坐标">
                <div className="flex gap-1">
                  <Input
                    value={`X: ${Math.round(selectedNode.position?.x ?? 0)}`}
                    disabled size="small"
                  />
                  <Input
                    value={`Y: ${Math.round(selectedNode.position?.y ?? 0)}`}
                    disabled size="small"
                  />
                </div>
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
                <Input placeholder="来源文档名称或 URL" />
              </Form.Item>

              <Divider style={{ margin: '8px 0' }}>
                <span className="text-xs text-gray-400" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ColumnWidthOutlined /> 尺寸
                </span>
              </Divider>

              <Form.Item label="宽 × 高（px）">
                <div className="flex gap-1 items-center">
                  <Form.Item name="width" noStyle>
                    <InputNumber
                      min={60} max={500} step={4} size="small"
                      placeholder="宽度" style={{ width: '100%' }}
                    />
                  </Form.Item>
                  <span className="text-gray-400 text-xs shrink-0">×</span>
                  <Form.Item name="height" noStyle>
                    <InputNumber
                      min={24} max={300} step={4} size="small"
                      placeholder="高度（自动）" style={{ width: '100%' }}
                    />
                  </Form.Item>
                </div>
                <div className="text-xs text-gray-400 mt-1">高度留空则由内容自动决定</div>
              </Form.Item>

              {nodeIssues.length > 0 && (
                <>
                  <Divider style={{ margin: '8px 0' }} />
                  {nodeIssues.map((issue, i) => (
                    <Alert
                      key={i}
                      type={
                        issue.level === 'error'   ? 'error'   :
                        issue.level === 'warning' ? 'warning' : 'info'
                      }
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

          {/* ── 边属性 ── */}
          {selectedEdge && !selectedNode && (
            <Form form={form} layout="vertical" size="small">
              <Form.Item label="连线 ID">
                <Input value={selectedEdge.id} disabled size="small" />
              </Form.Item>

              <Text className="text-xs text-gray-500 block mb-3">
                <span className="font-medium">
                  {rfNodes.find(n => n.id === selectedEdge.source)?.data?.label ?? selectedEdge.source}
                </span>
                {' → '}
                <span className="font-medium">
                  {rfNodes.find(n => n.id === selectedEdge.target)?.data?.label ?? selectedEdge.target}
                </span>
              </Text>

              <Form.Item name="edgeLabel" label="关系标签">
                <Input placeholder="例：导致、属于、依赖…" maxLength={30} />
              </Form.Item>

              <Divider style={{ margin: '8px 0' }}>
                <span className="text-xs text-gray-400" style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <ApartmentOutlined /> 连线样式
                </span>
              </Divider>

              <Form.Item name="edgeType" label="线形">
                <Select options={EDGE_TYPE_OPTIONS} placeholder="选择线形" />
              </Form.Item>

              <Form.Item name="edgeColor" label="颜色">
                <div className="flex items-center gap-2 flex-wrap">
                  {EDGE_COLORS.map(c => (
                    <Tooltip key={c} title={c}>
                      <div
                        className="w-5 h-5 rounded-full cursor-pointer shrink-0 transition-transform hover:scale-110"
                        style={{
                          background: c,
                          border: `2px solid ${form.getFieldValue('edgeColor') === c ? '#1677ff' : '#e2e8f0'}`,
                        }}
                        onClick={() => form.setFieldValue('edgeColor', c)}
                      />
                    </Tooltip>
                  ))}
                </div>
                <Form.Item name="edgeColor" noStyle>
                  <Input size="small" style={{ marginTop: 6 }} placeholder="#94a3b8" />
                </Form.Item>
              </Form.Item>

              <Form.Item name="animated" label="动画流动">
                <Select
                  options={[
                    { value: false, label: '关闭' },
                    { value: true,  label: '开启（虚线流动）' },
                  ]}
                />
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

      {/* 折叠/展开按钮 — 始终可见，跟随面板左边缘 */}
      <button
        className="absolute top-1/2 -translate-y-1/2 w-6 h-6 bg-white/70 backdrop-blur-sm border border-gray-200 rounded-full flex items-center justify-center text-gray-400 hover:text-gray-600 cursor-pointer shadow-sm transition-all duration-200"
        style={{ right: collapsed ? 0 : panelWidth-10, pointerEvents: 'auto' }}
        onClick={() => onCollapsedChange?.(!collapsed)}
        title={collapsed ? '展开属性' : '收起属性'}
      >
        {collapsed ? <LeftOutlined style={{ fontSize: 10 }} /> : <RightOutlined style={{ fontSize: 10 }} />}
      </button>
    </div>
  )
}
