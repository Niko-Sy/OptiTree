/**
 * Help — 帮助与反馈
 * 路由：/help
 */
import { useState } from 'react'
import { useNavigate } from 'react-router-dom'
import {
  Button, Card, Collapse, Form, Input, Radio,
  message, Divider, Row, Col, Typography,
} from 'antd'
import {
  ArrowLeftOutlined, QuestionCircleOutlined,
  ApartmentOutlined, ApiOutlined, ThunderboltOutlined,
  BugOutlined, BulbOutlined, MessageOutlined,
  RightOutlined, BookOutlined, TeamOutlined,
  MailOutlined,
} from '@ant-design/icons'
import UserAvatar from '../components/common/UserAvatar'

const { TextArea } = Input
const { Title, Text } = Typography

// ─── 快速入门卡片数据 ─────────────────────────────────────────────────────────
const QUICK_START = [
  {
    icon: <ApartmentOutlined className="text-2xl text-blue-500" />,
    bg: 'bg-blue-50',
    title: '新建故障树',
    desc: '点击首页右上角「+ 新建」按钮，选择「新建空白故障树」，在画布上拖拽节点开始构建。',
  },
  {
    icon: <TeamOutlined className="text-2xl text-green-500" />,
    bg: 'bg-green-50',
    title: '邀请协作者',
    desc: '打开项目设置，在「成员管理」标签中输入成员邮箱并分配权限，支持编辑者与查看者角色。',
  },
  {
    icon: <ThunderboltOutlined className="text-2xl text-purple-500" />,
    bg: 'bg-purple-50',
    title: 'AI 智能分析',
    desc: '在故障树编辑器中点击工具栏的「AI 分析」按钮，系统将自动检测逻辑缺失并给出优化建议。',
  },
]

// ─── FAQ 数据 ─────────────────────────────────────────────────────────────────
const FAQ_ITEMS = [
  {
    key: '1',
    label: '如何导出故障树/知识图谱？',
    children: (
      <p className="text-sm text-gray-600 leading-6">
        在编辑器工具栏中点击「导出」按钮，可选择 PNG 图片、JSON 数据或 PDF 报告格式导出。
        JSON 格式支持重新导入编辑，PNG/PDF 适合归档与分享。
      </p>
    ),
  },
  {
    key: '2',
    label: '协作者权限有哪些区别？',
    children: (
      <div className="text-sm text-gray-600 leading-6">
        <p className="mb-2">OptiTree 提供三种协作角色：</p>
        <ul className="list-disc list-inside space-y-1 ml-2">
          <li><b>管理员</b>：可编辑项目、管理成员、修改项目设置</li>
          <li><b>编辑者</b>：可查看并编辑项目内容，不可修改成员权限</li>
          <li><b>查看者</b>：仅可查看项目，不可进行任何修改操作</li>
        </ul>
      </div>
    ),
  },
  {
    key: '3',
    label: 'AI 文档识别支持哪些格式？',
    children: (
      <p className="text-sm text-gray-600 leading-6">
        目前支持 PDF、Word（.docx）、纯文本（.txt）格式的文档上传。
        图片格式暂不支持直接识别，建议先转换为 PDF 后上传。单个文件大小上限为 20MB。
      </p>
    ),
  },
  {
    key: '4',
    label: '项目数据会自动保存吗？',
    children: (
      <p className="text-sm text-gray-600 leading-6">
        编辑器每隔 30 秒自动保存一次草稿到本地。点击工具栏「保存」按钮或使用快捷键 Ctrl+S 可立即保存到服务器。
        协作模式下，所有成员的修改都会实时同步。
      </p>
    ),
  },
  {
    key: '5',
    label: '如何查看历史版本？',
    children: (
      <p className="text-sm text-gray-600 leading-6">
        在项目列表中点击项目卡片右侧的「···」菜单，选择「版本历史」即可查看所有保存的版本，
        支持版本对比和一键回滚。
      </p>
    ),
  },
  {
    key: '6',
    label: '忘记密码怎么办？',
    children: (
      <p className="text-sm text-gray-600 leading-6">
        在登录页点击「忘记密码」链接，输入注册邮箱后系统将发送重置链接。
        链接有效期为 24 小时，过期后需重新申请。
      </p>
    ),
  },
]

// ─── 主页面 ───────────────────────────────────────────────────────────────────
export default function Help() {
  const navigate = useNavigate()
  const [form] = Form.useForm()
  const [submitting, setSubmitting] = useState(false)

  async function handleSubmit() {
    try {
      const values = await form.validateFields()
      setSubmitting(true)
      // 模拟网络延迟（纯 mock）
      await new Promise(resolve => setTimeout(resolve, 800))
      message.success('反馈已提交，感谢你的意见！我们会尽快处理。')
      form.resetFields()
    } catch (err) {
      if (err?.errorFields) return // Ant Design 校验错误，已自动提示
      message.error('提交失败，请稍后重试')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      {/* ── Header ── */}
      <header className="bg-white border-b border-gray-200 shadow-sm sticky top-0 z-30">
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button
              icon={<ArrowLeftOutlined />}
              type="text"
              onClick={() => navigate(-1)}
              className="text-gray-500"
            />
            <div className="w-8 h-8 rounded-lg bg-orange-50 flex items-center justify-center">
              <QuestionCircleOutlined className="text-orange-500" />
            </div>
            <span className="font-semibold text-gray-900">帮助与反馈</span>
          </div>
          <UserAvatar size={32} />
        </div>
      </header>

      {/* ── 主内容 ── */}
      <main className="flex-1 max-w-5xl mx-auto w-full px-6 py-8 space-y-6">

        {/* 快速入门 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <BookOutlined className="text-blue-500" />
            <Title level={5} className="mb-0! text-gray-800!">快速入门</Title>
          </div>
          <Row gutter={[16, 16]}>
            {QUICK_START.map((item, idx) => (
              <Col key={idx} xs={24} sm={8}>
                <Card
                  className="h-full border border-gray-100 shadow-sm hover:shadow-md transition-shadow"
                  bodyStyle={{ padding: '20px 24px' }}
                >
                  <div className={`w-12 h-12 ${item.bg} rounded-xl flex items-center justify-center mb-3`}>
                    {item.icon}
                  </div>
                  <p className="font-semibold text-gray-900 text-sm mb-2">{item.title}</p>
                  <p className="text-xs text-gray-500 leading-5">{item.desc}</p>
                </Card>
              </Col>
            ))}
          </Row>
        </section>

        {/* FAQ */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <QuestionCircleOutlined className="text-blue-500" />
            <Title level={5} className="mb-0! text-gray-800!">常见问题</Title>
          </div>
          <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            <Collapse
              items={FAQ_ITEMS}
              bordered={false}
              expandIconPosition="end"
              className="faq-collapse"
              style={{ background: 'white' }}
            />
          </div>
        </section>

        {/* 意见反馈 */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <MessageOutlined className="text-blue-500" />
            <Title level={5} className="mb-0! text-gray-800!">意见反馈</Title>
          </div>
          <Card
            className="border border-gray-100 shadow-sm"
            bodyStyle={{ padding: '28px 32px' }}
          >
            <Form
              form={form}
              layout="vertical"
              requiredMark={false}
              initialValues={{ feedbackType: 'bug' }}
            >
              {/* 反馈类型 */}
              <Form.Item
                name="feedbackType"
                label={<span className="text-sm font-medium text-gray-700">反馈类型</span>}
                rules={[{ required: true }]}
              >
                <Radio.Group>
                  <Radio.Button value="bug">
                    <BugOutlined className="mr-1" />Bug 报告
                  </Radio.Button>
                  <Radio.Button value="feature">
                    <BulbOutlined className="mr-1" />功能建议
                  </Radio.Button>
                  <Radio.Button value="other">
                    <MessageOutlined className="mr-1" />其他问题
                  </Radio.Button>
                </Radio.Group>
              </Form.Item>

              {/* 标题 */}
              <Form.Item
                name="title"
                label={<span className="text-sm font-medium text-gray-700">问题标题</span>}
                rules={[
                  { required: true, message: '请填写问题标题' },
                  { max: 100, message: '标题不超过 100 个字符' },
                ]}
              >
                <Input placeholder="用一句话描述你遇到的问题或建议" maxLength={100} showCount />
              </Form.Item>

              {/* 详细描述 */}
              <Form.Item
                name="description"
                label={<span className="text-sm font-medium text-gray-700">详细描述</span>}
                rules={[
                  { required: true, message: '请填写详细描述' },
                  { min: 10, message: '描述不少于 10 个字符' },
                ]}
              >
                <TextArea
                  rows={5}
                  placeholder="请详细描述问题现象、复现步骤，或你的功能期望..."
                  maxLength={2000}
                  showCount
                />
              </Form.Item>

              {/* 联系邮箱（选填） */}
              <Form.Item
                name="contact"
                label={
                  <span className="text-sm font-medium text-gray-700">
                    联系邮箱&nbsp;<span className="text-gray-400 font-normal">（选填，方便我们回复你）</span>
                  </span>
                }
                rules={[
                  { type: 'email', message: '请输入有效的邮箱地址' },
                ]}
              >
                <Input prefix={<MailOutlined className="text-gray-400" />} placeholder="your@email.com" />
              </Form.Item>

              <Divider className="my-5" />

              <div className="flex items-center justify-between">
                <Text className="text-xs text-gray-400">
                  你的反馈将帮助我们持续改进 OptiTree
                </Text>
                <Button
                  type="primary"
                  size="large"
                  onClick={handleSubmit}
                  loading={submitting}
                  icon={<MessageOutlined />}
                >
                  提交反馈
                </Button>
              </div>
            </Form>
          </Card>
        </section>
      </main>
    </div>
  )
}
