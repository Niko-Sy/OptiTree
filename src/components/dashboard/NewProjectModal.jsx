// 新建项目的模态框组件，包含项目名称输入和模板选择功能
import { Modal, Form, Input, Select } from 'antd'

const TEMPLATE_OPTIONS = [
  { value: 'blank',  label: '空白项目' },
  { value: 'power',  label: '电源故障分析模板' },
  { value: 'software', label: '软件故障分析模板' },
]

export default function NewProjectModal({ open, onConfirm, onCancel }) {
  const [form] = Form.useForm()

  function handleOk() {
    form.validateFields().then(values => {
      onConfirm({ name: values.name, template: values.template || 'blank' })
      form.resetFields()
    })
  }

  function handleCancel() {
    form.resetFields()
    onCancel()
  }

  return (
    <Modal
      title="新建故障树项目"
      open={open}
      onOk={handleOk}
      onCancel={handleCancel}
      okText="创建"
      cancelText="取消"
      width={420}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          label="项目名称"
          name="name"
          rules={[
            { required: true, message: '请输入项目名称' },
            { max: 50, message: '名称最多 50 个字符' },
          ]}
        >
          <Input placeholder="例：飞控系统故障分析" autoFocus />
        </Form.Item>
        <Form.Item label="初始模板" name="template" initialValue="blank">
          <Select options={TEMPLATE_OPTIONS} />
        </Form.Item>
      </Form>
    </Modal>
  )
}
