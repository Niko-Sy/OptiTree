// 新建项目的模态框组件，包含项目名称输入和模板选择功能
import { Modal, Form, Input, Select } from 'antd'

const { TextArea } = Input

const TEMPLATE_OPTIONS = [
  { value: 'blank',    label: '空白项目' },
  { value: 'power',    label: '电源故障分析模板' },
  { value: 'software', label: '软件故障分析模板' },
]

export default function NewProjectModal({ open, onConfirm, onCancel }) {
  const [form] = Form.useForm()

  function handleOk() {
    form.validateFields().then(values => {
      onConfirm({
        name:        values.name,
        template:    values.template || 'blank',
        description: values.description || '',
        tags:        values.tags || [],
      })
      form.resetFields()
    })
  }

  function handleCancel() {
    form.resetFields()
    onCancel()
  }

  return (
    <Modal
      title="🌳 新建故障树项目"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="创建"
      cancelText="取消"
      destroyOnHidden
      width={440}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          name="name"
          label="项目名称"
          rules={[
            { required: true, message: '请输入项目名称' },
            { max: 50, message: '名称最多 50 个字符' },
          ]}
        >
          <Input placeholder="例：飞控系统故障分析" maxLength={50} showCount autoFocus />
        </Form.Item>

        <Form.Item name="template" label="初始模板" initialValue="blank">
          <Select options={TEMPLATE_OPTIONS} />
        </Form.Item>

        <Form.Item name="description" label="描述（可选）">
          <TextArea
            placeholder="简要描述该故障树的用途或范围..."
            rows={3}
            maxLength={200}
            showCount
          />
        </Form.Item>

        <Form.Item name="tags" label="标签（可选）">
          <Select
            mode="tags"
            placeholder="输入标签后按回车确认，支持多个"
            tokenSeparators={[',']}
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
