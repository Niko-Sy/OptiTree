import { useEffect, useState } from 'react'
import { Modal, Form, Input, Select, message } from 'antd'
import { updateProject } from '../../services/projectService'

const { TextArea } = Input

function normalizeTags(tags) {
  if (!Array.isArray(tags)) return []
  const cleaned = tags
    .map(tag => String(tag ?? '').trim())
    .filter(Boolean)
  return [...new Set(cleaned)]
}

export default function UpdateProjectModal({ open, project, onCancel, onUpdated }) {
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    if (!open) return
    form.setFieldsValue({
      name: project?.name || '',
      description: project?.description || '',
      tags: normalizeTags(project?.tags),
    })
  }, [open, project, form])

  async function handleOk() {
    if (!project?.id) return
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      const payload = {
        name: values.name?.trim(),
        description: values.description?.trim() || '',
        tags: normalizeTags(values.tags),
      }
      const data = await updateProject(project.id, payload)
      const nextProject = { ...project, ...(data?.project || {}), ...payload }
      message.success('项目信息已更新')
      onUpdated?.(nextProject)
    } catch (err) {
      if (err?.errorFields) return
      message.error(err?.message || '更新失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  function handleCancel() {
    if (submitting) return
    onCancel?.()
  }

  return (
    <Modal
      open={open}
      title="修改项目详情"
      okText="保存"
      cancelText="取消"
      onOk={handleOk}
      onCancel={handleCancel}
      confirmLoading={submitting}
      destroyOnHidden
      width={460}
      okButtonProps={{ disabled: !project?.id }}
    >
      <Form form={form} layout="vertical" className="mt-4">
        <Form.Item
          name="name"
          label="项目名称"
          rules={[
            { required: true, message: '请输入项目名称' },
            { max: 50, message: '名称最多 50 个字符' },
            {
              validator: (_, value) => (String(value || '').trim()
                ? Promise.resolve()
                : Promise.reject(new Error('请输入项目名称'))),
            },
          ]}
        >
          <Input placeholder="请输入项目名称" maxLength={50} showCount autoFocus />
        </Form.Item>

        <Form.Item
          name="description"
          label="描述（可选）"
          rules={[{ max: 200, message: '描述最多 200 个字符' }]}
        >
          <TextArea
            placeholder="简要描述该项目用途或范围..."
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
            maxTagCount="responsive"
          />
        </Form.Item>
      </Form>
    </Modal>
  )
}
