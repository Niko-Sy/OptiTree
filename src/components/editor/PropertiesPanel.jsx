import { useEffect } from 'react'
import { Form, Input, Select, Button, Alert, Empty, Divider, Tag, InputNumber, Tooltip } from 'antd'
import { DeleteOutlined, SaveOutlined, RobotOutlined, DisconnectOutlined, InfoCircleOutlined } from '@ant-design/icons'
import { useEditorStore, useEditorActions } from '../../store/useEditorStore'

const TYPE_OPTIONS = [
  { value: 'topEvent',   label: '顶事件' },
  { value: 'midEvent',   label: '中间事件' },
  { value: 'basicEvent', label: '基本事件' },
  { value: 'gate',       label: '逻辑门' },
]

const GATE_TYPE_OPTIONS = [
  { value: 'OR',  label: 'OR  门 — 任意输入即触发' },
  { value: 'AND', label: 'AND 门 — 所有输入才触发' },
  { value: 'NOT', label: 'NOT 门 — 输入取反' },
]

// ─── Edge panel ───────────────────────────────────────────────────
function EdgePanel() {
  const { state } = useEditorStore()
  const { deleteEdge } = useEditorActions()

  const edge = state.edges.find(e => e.id === state.selectedEdgeId)
  const fromNode = edge ? state.nodes.find(n => n.id === edge.from) : null
  const toNode   = edge ? state.nodes.find(n => n.id === edge.to)   : null

  if (!edge) return null

  return (
    <>
      <div className="mb-3 p-2 bg-blue-50 rounded-lg text-xs text-blue-700 border border-blue-100">
        <p className="font-semibold mb-1">已选中连线</p>
        <p>从：<span className="font-mono">{fromNode?.name ?? edge.from}</span></p>
        <p>至：<span className="font-mono">{toNode?.name  ?? edge.to}</span></p>
      </div>
      <Button
        danger
        icon={<DisconnectOutlined />}
        onClick={() => deleteEdge(edge.id)}
        block
        size="small"
      >
        删除连线
      </Button>
    </>
  )
}

// ─── Node panel ───────────────────────────────────────────────────
function NodePanel() {
  const { state } = useEditorStore()
  const { updateNode, deleteNode } = useEditorActions()
  const [form] = Form.useForm()

  const selected = state.nodes.find(n => n.id === state.selectedNodeId)

  useEffect(() => {
    if (selected) form.setFieldsValue({
      name: selected.name,
      type: selected.type,
      probability: selected.probability ?? null,
      width: selected.width,
      height: selected.height,
    })
    else form.resetFields()
  }, [selected, form])

  if (!selected) return null

  function handleApply() {
    form.validateFields().then(values => {
      const patch = { name: values.name, type: values.type }
      if (values.type === 'basicEvent') {
        patch.probability = values.probability ?? null
      }
      if (values.width  > 0)  patch.width  = values.width
      if (values.height > 0) patch.height = values.height
      updateNode(selected.id, patch)
    })
  }

  const issuesForNode = state.aiIssues.filter(i => i.nodeId === selected.id)

  return (
    <>
      <Form form={form} layout="vertical" size="small">
        <Form.Item label="ID">
          <Input value={selected.id} disabled />
        </Form.Item>
        {selected.type === 'gate' ? (
          <Form.Item label="门类型" name="name" rules={[{ required: true, message: '请选择门类型' }]}>
            <Select options={GATE_TYPE_OPTIONS} />
          </Form.Item>
        ) : (
          <Form.Item label="名称" name="name" rules={[{ required: true, message: '名称不能为空' }]}>
            <Input placeholder="输入节点名称" />
          </Form.Item>
        )}
        <Form.Item label="类型" name="type">
          <Select options={TYPE_OPTIONS} />
        </Form.Item>
        <Form.Item label="坐标">
          <div className="flex gap-1">
            <Input value={`X: ${Math.round(selected.x)}`} disabled size="small" />
            <Input value={`Y: ${Math.round(selected.y)}`} disabled size="small" />
          </div>
        </Form.Item>
        <Form.Item label="尺寸（宽 × 高）">
          <div className="flex gap-1 items-center">
            <Form.Item name="width" noStyle>
              <InputNumber min={40} max={400} step={4} size="small"
                placeholder="宽" style={{ width: '100%' }} />
            </Form.Item>
            <span className="text-gray-400 text-xs shrink-0">×</span>
            <Form.Item name="height" noStyle>
              <InputNumber min={24} max={300} step={4} size="small"
                placeholder="高" style={{ width: '100%' }} />
            </Form.Item>
          </div>
        </Form.Item>
        {(selected.type === 'basicEvent' || form.getFieldValue('type') === 'basicEvent') && (
          <Form.Item
            label={
              <span className="flex items-center gap-1">
                失效率 / 概率
                <Tooltip title="基本事件发生概率，取值范围 0 ~ 1">
                  <InfoCircleOutlined className="text-gray-400" />
                </Tooltip>
              </span>
            }
            name="probability"
          >
            <InputNumber
              min={0} max={1} step={0.0001}
              placeholder="0.0001"
              style={{ width: '100%' }}
              size="small"
            />
          </Form.Item>
        )}
      </Form>

      {issuesForNode.length > 0 && (
        <div className="space-y-1 mt-1 mb-2">
          {issuesForNode.map((issue, i) => (
            <Alert
              key={i}
              type={issue.level === 'error' ? 'error' : issue.level === 'warning' ? 'warning' : 'info'}
              message={issue.message}
              showIcon
              banner
              className="text-xs"
            />
          ))}
        </div>
      )}

      <div className="flex flex-col gap-2 mt-2">
        <Button type="primary" icon={<SaveOutlined />} onClick={handleApply} block size="small">
          应用更改
        </Button>
        <Button danger icon={<DeleteOutlined />} onClick={() => deleteNode(selected.id)} block size="small">
          删除节点
        </Button>
      </div>

      {/* Extended metadata from external format import */}
      {(selected.eventId || selected.description || selected.gateType ||
        (selected.rules && selected.rules.length > 0) || selected.investigateMethod) && (
        <div className="mt-3">
          <div className="text-xs font-semibold text-gray-400 uppercase tracking-wide mb-2">事件详情</div>
          <div className="space-y-1.5 text-xs">
            {selected.eventId && (
              <div className="flex justify-between">
                <span className="text-gray-400">事件编号</span>
                <span className="font-mono text-gray-600 truncate max-w-32" title={selected.eventId}>{selected.eventId}</span>
              </div>
            )}
            {selected.gateType && (
              <div className="flex justify-between">
                <span className="text-gray-400">逻辑门</span>
                <span className="font-semibold text-blue-600">{selected.gateType}</span>
              </div>
            )}
            {selected.errorLevel && (
              <div className="flex justify-between">
                <span className="text-gray-400">错误等级</span>
                <span className="text-gray-600">{selected.errorLevel}</span>
              </div>
            )}
            {selected.priority > 0 && (
              <div className="flex justify-between">
                <span className="text-gray-400">优先级</span>
                <span className="text-gray-600">{selected.priority}</span>
              </div>
            )}
            {selected.description && (
              <div>
                <span className="text-gray-400">描述</span>
                <p className="mt-0.5 text-gray-600 break-words">{selected.description}</p>
              </div>
            )}
            {selected.investigateMethod && (
              <div>
                <span className="text-gray-400">排查方法</span>
                <p className="mt-0.5 text-gray-600 break-words">{selected.investigateMethod}</p>
              </div>
            )}
            {selected.rules && selected.rules.length > 0 && (
              <div>
                <span className="text-gray-400">告警规则（{selected.rules.length} 条）</span>
                <div className="mt-1 space-y-1">
                  {selected.rules.map((rule, i) => (
                    <div key={i} className="bg-gray-50 rounded p-1.5 text-gray-600 font-mono text-xs break-all">
                      {rule.measurePointName}
                      {rule.symbol && rule.thresholds?.length > 0
                        ? ` ${rule.symbol} ${rule.thresholds.join(', ')}`
                        : ''}
                      {rule.duration ? ` 持续 ${rule.duration}s` : ''}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  )
}

// ─── Main panel ───────────────────────────────────────────────────
export default function PropertiesPanel({ collapsed, onCollapsedChange }) {
  const { state } = useEditorStore()
  const setCollapsed = onCollapsedChange

  const hasNode = !!state.selectedNodeId
  const hasEdge = !!state.selectedEdgeId

  const globalIssues = state.aiIssues.filter(i => i.nodeId === null) // eslint-disable-line no-unused-vars

  return (
    <div
      className="absolute right-0 top-0 bottom-0 z-20 bg-white border-l border-gray-200 flex flex-col transition-all duration-200"
      style={{ width: collapsed ? 0 : 256 }}
    >
      {/* Floating toggle button — protrudes from left edge */}
      <button
        onClick={() => setCollapsed(c => !c)}
        title={collapsed ? '展开属性面板' : '收起属性面板'}
        style={{
          position: 'absolute',
          left: collapsed ? 0 : 10,
          top: '50%',
          transform: 'translate(-100%, -50%)',
          zIndex: 30,
          outline: 'none',
        }}
        className="w-6 h-6 flex items-center justify-center rounded-full
          bg-white border  border-gray-300 
          text-gray-800  shadow-sm hover:text-blue-500 hover:bg-blue-50
          transition-colors cursor-pointer select-none"
      >
        <svg width="8" height="8" viewBox="0 0 10 14" fill="none">
          {collapsed
            ? <path d="M8 2L2 7l6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
            : <path d="M2 2l6 5-6 5" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
          }
        </svg>
      </button>

      {/* Panel content — hidden when collapsed */}
      {!collapsed && (
        <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
          <div className="px-3 py-2 border-b border-gray-200">
            <p className="text-xs font-semibold text-gray-500 uppercase tracking-wide">属性面板</p>
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {hasEdge ? (
              <EdgePanel />
            ) : hasNode ? (
              <NodePanel />
            ) : (
              <Empty
                image={Empty.PRESENTED_IMAGE_SIMPLE}
                description={<span className="text-xs text-gray-400">点击节点或连线以编辑属性</span>}
                className="mt-8"
              />
            )}

            {/* Global AI issues */}
            {state.aiIssues.length > 0 && (
              <>
                <Divider style={{ margin: '12px 0' }}>
                  <span className="text-xs text-gray-500 flex items-center gap-1">
                    <RobotOutlined /> AI 校验报告
                  </span>
                </Divider>
                <div className="space-y-2">
                  {state.aiIssues.map((issue, i) => (
                    <div
                      key={i}
                      className={`text-xs p-2 rounded border flex items-start gap-1.5 ${
                        issue.level === 'error'   ? 'bg-red-50 border-red-200 text-red-700' :
                        issue.level === 'warning' ? 'bg-yellow-50 border-yellow-200 text-yellow-700' :
                                                   'bg-blue-50 border-blue-200 text-blue-700'
                      }`}
                    >
                      <Tag
                        color={issue.level === 'error' ? 'error' : issue.level === 'warning' ? 'warning' : 'processing'}
                        className="text-xs shrink-0 leading-tight"
                      >
                        {issue.level === 'error' ? '错误' : issue.level === 'warning' ? '警告' : '提示'}
                      </Tag>
                      <span>{issue.message}</span>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  )
}
