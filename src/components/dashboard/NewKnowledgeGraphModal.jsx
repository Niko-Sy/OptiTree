/**
 * NewKnowledgeGraphModal — 创建空白知识图谱
 * Props:
 *   open         — 是否显示
 *   onConfirm(kg) — 创建成功回调，kg: { id, name, description, ... }
 *   onCancel     — 取消回调
 */
import { Modal, Form, Input } from 'antd'

const { TextArea } = Input

export default function NewKnowledgeGraphModal({ open, onConfirm, onCancel }) {
  const [form] = Form.useForm()

  function handleOk() {
    form.validateFields().then(values => {
      form.resetFields()
      onConfirm?.({
        id: `kg_${Date.now()}`,
        name: values.name,
        description: values.description ?? '',
        createdAt: new Date().toISOString(),
        type: 'kg',
        entityCount: 0,
        relationCount: 0,
        tags: [],
      })
    })
  }

  function handleCancel() {
    form.resetFields()
    onCancel?.()
  }

  return (
    <Modal
      open={open}
      title="📊 新建知识图谱"
      okText="创建"
      cancelText="取消"
      onOk={handleOk}
      onCancel={handleCancel}
      destroyOnHidden
      width={440}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          name="name"
          label="图谱名称"
          rules={[
            { required: true, message: '请输入图谱名称' },
            { max: 50, message: '名称最多 50 个字符' },
          ]}
        >
          <Input
            placeholder="例：液压系统故障知识图谱"
            maxLength={50}
            showCount
          />
        </Form.Item>

        <Form.Item name="description" label="描述（可选）">
          <TextArea
            placeholder="简要描述该知识图谱的用途或范围..."
            rows={3}
            maxLength={200}
            showCount
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
